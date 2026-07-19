# DESIGN — Space Station Game North Star

**Status: current as of 2026-07-18.** This is the one design doc. A new agent should read this first, then `docs/00-overview.md` for the code map, then `docs/99-trip-wires.md` before committing. Everything here supersedes the retired proposal/roadmap docs (removed 2026-07-18; git history preserves them).

---

## 1. Vision

The Expanse fantasy: **start scrappy, become the CEO of a thriving solar-system station.**

The player begins as the hands-on operator of a small orbital outpost — admitting ships one at a time, hauling cargo, feeding visitors — and grows one persistent station into the indispensable commercial hub of its region. The station is the physical intersection of a changing orbital economy, a persistent population, and a dangerous environment. Every accepted ship, industry, and population makes something possible, consumes scarce physical capacity, and creates future obligations. The station remembers the player's choices in its layout, residents, infrastructure, and reputation.

Standing pillars:

- **Layout creates gameplay.** Room placement, berth access, corridors, and utility reach matter more than checklist completion.
- **People make the station alive.** Crew, visitors, and residents have visible needs, routines, and path pressure.
- **Systems are inspectable.** If the sim calculates a problem, the player can see it — through the world first, panels second.
- **Failure is recoverable.** Bad designs create shortages, slowdowns, incidents, and reputation loss before total collapse.
- **Station identity emerges.** Trade hub, habitat, industrial yard — different traffic and layouts push different stations.

---

## 2. The chosen direction (decided 2026-07-18)

**The A+B progression: one persistent station where management changes altitude with scale.**

The player's *verb* evolves as the station grows — not by switching game modes, but because earned automation absorbs the micro they've already mastered:

- **Act 1 — Dock Operator (hands-on).** The player personally works the port: inspect an inbound manifest, reserve a berth, watch the turnaround (customs, gangway, cargo), reinforce staffing, chase the bottleneck. Every decision is manual and physical. This is the slice that exists today (§5).
- **Act 2 — Station Manager.** Repeated solutions become policies: berth rules auto-route matching low-risk ships, shift templates staff the routine, stock targets keep buffers filled. The player's attention moves to exceptions, expansion, and which traffic to cultivate.
- **Act 3 — CEO.** The micro is delegated; the player allocates capital, courts constituencies, and shapes the station's standing in the regional economy. (Later; see §6.)

**Unified by earned automation.** Automation is a progression *unlock*, not a default. You automate a task only after you've solved it manually enough times, and exceptions always escalate back to manual. Every automatic decision reports the rule that caused it and can be overridden in-world. Progression = your job title changing because the station outgrew your hands.

**The core loop at every altitude:**

> **admit → absorb → operate → the results shape who hails next**

Admit a ship against finite berths; absorb its people and cargo into your physical station; operate the turnaround and the services under load; and let the outcome (reliability, service quality, safety) steer which traffic hails you next. That feedback edge — operations reshaping future demand — is what makes the loop a game instead of a faucet.

---

## 3. Design principles

These are rules, distilled from the 2026-07-18 design research (code audit + genre taxonomy + peer synthesis). Follow them when designing anything new.

### (a) The two orthogonal gaps — attack both, always

Every "the game is boring" complaint resolves into one of two independent problems:

| Gap | Symptom | The fix | NOT the fix |
|---|---|---|---|
| **Actuator gap** | "Turn on the sim and credits accumulate; nothing to do" | Wire sensors → *felt* consequences. The codebase historically built the sensor and the display but not the actuator — numbers that never reach traffic, money, speed, or destruction. | More systems, more panels, more overlays. Each new sensor drains into the same dead bus. |
| **Variance gap** | "I draw the same rooms in the same spot every time" | Seeded, situational *inputs* that change the question each session (which ships arrive, what the region wants, what state you inherit). | More rules. Adding a rule to a deterministic optimization relocates the optimum; it doesn't create a choice. Razor: if a wiki page could tell you the right answer, it's a rule, not a choice. |

Reference list of cheap actuator wires from the audit (some now landed in the port-ops slice, the rest still the highest consequence-per-line work available): rating→arrival rate; reputation→demand mix; wear multipliers that actually slow production; residents who can actually leave; a priced cantina (supply line for the drink drip); reachable fire ignition; debris that actually breaches hull.

### (b) World variance in; choice-buff variance out (owner veto)

- **Wanted:** the *situation* changes — which ships arrive, regional demand, prices, inherited state, stakeholders leaning on you. Variance lives in the fiction: a ship on approach, a person with a demand, a price on a ticker.
- **Vetoed:** the *player's powers* change via meta-picks — pick-a-card perk drafts, buff selections, blueprint lotteries, run modifiers. Also vetoed: run-based play with disposable stations. This is **one persistent station grown across sessions**.
- The line: finite physical ship traffic is *not* a "draft." Berth admission is an ordinary operations mechanic as long as ships exist in the world with positions and timing. It becomes card-like only when abstracted into offers detached from space and time. Stay on the physical side.

### (c) Watchable, not a dashboard — operate through the world

The player acts on the station, not on menus. Berth state lives on berth badges, stalls are diagnosed by hovering the stalled thing in the world, alerts appear over the affected facility, policies live on docks/rooms/districts rather than an administration screen. No resource exists only as a counter; no alert exists without a world target and at least one immediate action. Raw telemetry goes behind a debug toggle.

### (d) The master question

> **What object does the player repeatedly inspect, manipulate, and improve?**

Today's answer: *the port* — the ships on approach, the berths, and the floor that absorbs them. Any proposed feature should name its answer to this question before it's built. If it can't, it's a sensor without an actuator.

### Standing cut list

Do not invest further in these until they have real actuators: the bridge-terminal/command zoo, the six dead utility layers (only air-duct has a sim consumer), thermal, morale as a headline stat, route-exposure micro-ticks, the tax slider. They are sensors wired to a dead bus.

---

## 4. Where we sit (genre positioning)

By player-behavior loop (categories named by what the player repeatedly manipulates), this game is a **lightweight station tycoon crossed with institution/service operations** — the berth → visitor → service rooms → credits chain, run through queues, jobs, and logistics. Its nearest latent neighbors, in code that already half-exists, are the **agent-story colony** (a deep crew-needs sim nobody watches yet), the **environmental engineer** (air/thermal/fire physics, mostly unwired), and the **society/political-economy manager** (factions, residents, district reputation — the natural Act 3 material). The chosen direction deepens the home loops first and borrows from the neighbors deliberately, not by drift.

The seven loops, for orientation: **L1** production/logistics optimizer (Factorio, Anno) · **L2** network/land-use planner (SimCity) · **L3** environmental systems engineer (Oxygen Not Included) · **L4** institution/service operator (Prison Architect, Startopia) — *our home* · **L5** agent-story colony (RimWorld) · **L6** society/political-economy manager (Tropico, Songs of Syx) — *the Act 3 borrow* · **L7** crisis governance (Frostpunk).

---

## 5. Current state — what's built (July 2026)

The **integrated port-operations slice** shipped on branch `finn/integrated-port-ops`, live at **bmo.ryanboye.com/finn/spacegame-port-ops/**. It is Act 1 playable end to end:

- **Finite berth admission.** Ships are persistent visits with manifests (brings / wants / pays / occupies / risks), forecast on approach. The player Reserves a berth, Holds, or Refuses — admission is a decision, not an automatic spawn.
- **Physical docking turnaround.** The single dock timer is replaced by real work tracks — customs/gangway passenger flow, cargo unload into hauling jobs — performed by crew at the berth. Stalls are diagnosable in-world (racks full, passengers still in the market, no crew).
- **Bound economy.** Manifests bind to physical exports and selective freight — the station accepts useful freight only; no inventory appears or disappears except through a visible node, carrier, module, or ship.
- **Crew staffing as an operational choice.** Shift roster with per-facility staffing; reinforcing the dock during a rush costs coverage elsewhere.
- **Berth service reputation.** Turnaround reliability is tracked and consequential — it feeds back into future traffic.
- **Earned automation, first rungs.** Auto-routing unlocks after 3 manual turnarounds; auto-staffing unlocks at 10 crew. Both inspectable and overridable.
- **A cramped working food loop** as the opening state, so the first arrivals stress a real floor.

Underneath it, the pre-existing simulation stands: per-tile hull/rooms/pressure/air, pathfinding agents with needs and queues, a real logistics/job engine, food and trade-goods chains, docks/lanes/ship types, residents, incidents (trespass/fight/theft with district memory), reputation zones, construction with EVA, expansion, save/load. See `docs/` for the per-system reference.

---

## 6. What's next / open questions

**Mid game (Act 2):** extend earned automation upward — supervisor policies at multiple berths, stock targets, district-level policies — while keeping exceptions manual. Broaden the world-variance channels beyond intake: economic weather (seeded price/demand curves with announced shocks), inherited-state starts, and unfreezing the hardcoded RNG seed (1337) so sessions differ.

**Late game (Act 3), if pursued:** reputation zones maturing into constituency geography; VIP/resident districts with prestige stakes; a stakeholder/political-economy layer — a board, a union, patron factions with persistent interests and real power (they remember, their wants conflict, and they can act on you: withhold funding, strike, reroute traffic). Guard rail: stakeholders without memory and power are event cards with faces — the vetoed thing in a costume.

**Biggest pending owner call:** berth distance/placement economics (how far from the core berths may sit, and what that costs).

**Deferred design menu:** the full research corpus — the six evaluated paths (A wired-home-loops, B commitment engine, C agent-story, D environmental-engineer, G political-economy, F staged hybrid), the mechanics catalog (actuator wires, world-variance generators, stakeholder channel, watchability kit), and the milestone-gated slice spec — lives in-repo at **`docs/research/`** (`ASSESSMENT-SYNTHESIS.md` is the decision map, `AUDIT-A-CODE-INVENTORY.md` the code autopsy; `docs/research/README.md` indexes the rest). Consult before proposing new systems; don't rebuild what was already evaluated and scored.

---

## 7. System reference

`docs/00` through `docs/13` are the detailed, descriptive simulation reference (tick loop, build/world, utilities, logistics, crew, visitors/residents, docks/ships, incidents, progression, economy, render, UI, pipelines) — written pre-port-ops, so parts are superseded by the slice; each kept doc carries a flag saying so. `docs/14-agent-playtest-guide.md` covers automated playtesting; `docs/99-trip-wires.md` is the cross-cutting-invariants list — read it before committing. `docs/research/` holds the full July 2026 design-research corpus behind §2–§4 and §6. `PROJECT_MAP.md` / `REFACTOR_PLAN.md` track the ongoing `sim.ts` extraction effort. Code is the source of truth; when a doc contradicts the code, fix the doc.
