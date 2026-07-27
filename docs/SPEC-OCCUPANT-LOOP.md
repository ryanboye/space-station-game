# FEATURE SPEC — The Occupant Loop

**Status:** draft for owner approval · 2026-07-27
**Supersedes nothing.** Builds on `docs/research/RX-AGENT-LIFE.md`, `RX-OCCUPANT-PLAYBOOK.md`, `RX-RUNNING-PHASE.md`, `RX-BUILD-CRAFT.md`, `RX-CODEX-REVIEW.md`.

---

## 1. The problem, precisely

Three complaints, one root:

1. **Building isn't satisfying** — a market is a ten-tile box with one 1×1 stall.
2. **Layout doesn't matter** — position changes nothing you can feel.
3. **Nothing to do once it runs** — *"you press play and watch. It's like watching an ant farm."*

The root cause is not missing systems. **Six times over, the system exists and has been dialled to zero or fenced off:**

| System | State today |
|---|---|
| Queue that spills through the door | Built. Capped at **6 tiles** outside the room, balk at 12. |
| Path congestion cost | Built. Capped at `min(1 / 2.5 / 3)`. |
| Rating penalties | Built. Capped at `min(0.24)`, `min(0.28)`. |
| Noise-vs-walk spatial dilemma | Both arms built. Discomfort clamped 0–8; walk penalty saturates ~47 tiles. |
| Visitor variety (4 archetypes, multi-leg trips) | Built. **Rusher does 0 extra legs 90% of the time; diner 68%.** |
| Full needs lifecycle w/ sleeping, hygiene, regenerating hunger/energy | Built — **but only for residents.** Visitors get 6 states, one pass. |

And one deliberate choice that removed the most valuable property of all:

> `sim.ts` — *"Roll once at spawn so the inspector can show the visitor's intended itinerary and downstream rooms see a stable plan."*

**The itinerary is decided the instant a visitor appears, so it can be displayed.** Legibility was traded for discovery.

### Why "more modules" is not the fix
The owner's constraint stands: *"that can't manifest in just a longer checklist."* A test that gates each fixture on being individually good says nothing about **required vs optional**. Five mandatory good fixtures is still "place five instead of one."

### What actually separates a living crowd from a conveyor
From the four-game comparison (Theme Hospital · Space Haven · Gnomoria · Prison Architect). Duration is **not** the axis — Theme Hospital's patients live ~30 seconds and it is deeply watchable; Gnomoria's gnomes are immortal and read as interchangeable drones. A population needs **at least two** of:

- **G1 — hidden state the player discovers** as the agent proceeds.
- **G2 — interference:** journeys collide on the same scarce rooms, so the crowd is one system rather than parallel dots.
- **G3 — a trajectory the player influenced:** the ending differs because of something they did.

**Our visitors have none.** This spec installs G1 and G2, and opens the door to G3.

---

## 2. The core change

**One occupant type with a stay length.** Delete the visitor/resident conceptual split. A single agent with regenerating needs and a dwell time spanning twenty seconds to permanent.

```
courier          ~20s        one errand
shore leave      minutes     a few wants
freighter crew   a shift     bored, repeat customers
repair crew      days        effectively a temporary resident
settler          forever     an actual resident
```

**Want and stay length are hidden but inferable.** The ship's business is the tell; the specifics are discovered by processing the occupant or by watching what they do.

Three properties fall out, and each maps to a complaint:

| Property | Fixes |
|---|---|
| Long, overlapping stays whose occupants keep returning to the same rooms | **(3)** ant farm — the crowd becomes one interfering system |
| Every need consumes a physical slot for a duration; slots run out | **(2)** layout matters, and **(1)** you feel the need to build more |
| Want and duration hidden, revealed progressively | **(3)** something is always being discovered; no two shifts identical |

---

## 3. Mechanics

### 3.1 Occupant model

Extend the existing agent rather than adding a class.

```
Occupant {
  stayClass:  'errand' | 'shore' | 'shift' | 'extended' | 'permanent'
  departsAt:  number | null        // null = permanent
  needs:      { hunger, energy, hygiene, ...}   // regenerate over time
  wants:      Want[]               // hidden until revealed
  revealed:   boolean
  originShip: ShipRef              // supplies the tell
}
```

`errand` occupants behave as visitors do today. `extended` and `permanent` run the **existing resident lifecycle** (`ResidentState`: Idle · ToCafeteria · Eating · ToDorm · Sleeping · ToHygiene · Cleaning · ToLeisure · Leisure) with its existing regenerating needs. **This is reuse, not new behaviour.**

### 3.2 Needs regenerate; wants are one-shot

- **Needs** (hunger, energy, hygiene) rise over time and drive the resident loop. Long stays therefore generate *continuing* demand — this is the engine that replaces authored events.
- **Wants** are discrete desires attached to the visit (a drink, a souvenir, a view). One-shot. A short-stay occupant is mostly wants; a long-stay occupant is mostly needs.

### 3.3 Slot occupancy — the 1:1 rule

**Every need or want is satisfied by occupying a specific physical slot for a duration, during which no one else may use it.**

This machinery already exists: `serveTimer` holds a provider slot for the length of the service, and the code comment states this is *"what makes a second serving station a real decision and lines physical."* Tables expose seats.

**Must be brought up to the same standard:**
- **Beds** — currently `residentCapacity: 2` and little else. Must become claimable slots with occupancy and duration.
- **Market stall** — currently one 1×1 tile serving unlimited customers. **Port the cafeteria's queue/serving-slot system wholesale.** This is the single largest cheap win in the spec.

### 3.4 Hidden demand and the reveal

**Stop pre-rolling the itinerary at spawn.**

- An occupant arrives with `revealed = false`. The player sees the **ship** and can infer a rough profile from it.
- **Processing reveals SOME of it, never all.** A customs or reception point might surface the headline want and a rough stay estimate, while follow-on wants and the true duration continue to emerge from watching. Partial reveal keeps discovery alive for the whole visit instead of collapsing it into one moment — and it means a processed occupant can still surprise you.
- **The reveal is free but slow by default.** You learn what someone wants by watching where they go. **Reception is therefore an investment that buys the information *earlier*, not a gate everyone must pass through.** This matters: a mandatory desk reads as a bureaucratic tollbooth and becomes a chore, whereas an optional one that buys foresight is a decision the player makes for their own reasons.
- **If reception is saturated,** the occupant proceeds unprocessed: they **guess**, route to a plausible room, and are more likely to be wrong — clogging the wrong queue, then leaving unsatisfied.
- The player's live decision: **invest in reception throughput, or let people gamble and absorb the misrouting.** This is Theme Hospital's diagnose-vs-gamble, one-to-one, and it makes reception a shared choke that couples every occupant's journey (**G2**).

**Hidden must mean inferable, not random.** Each ship archetype carries a readable cue (see `RX-OCCUPANT-PLAYBOOK.md`). A heavy freighter implies idle crew for as long as cargo takes; a repair job implies days; a courier pod implies seconds. The player reads the cue, commits capacity, and finds out whether they judged it right. Unreadable randomness is weather, not skill.

### 3.5 Admission — the offer list is a portfolio decision

**This is the spine of the loop.** Arrivals are not weather; they are a list you choose from. The machinery exists — `state.trafficOffers` and `manualTrafficAdmission` already implement an offer queue the player admits from.

The player looks down a list of pending arrivals and composes a **mix** against the capacity they have over the next stretch:

> *"OK — quick win. Quick win. Errr, I'll try this longer one. Err, not sure about this one…"*

That texture is the design. Each offer carries a readable cue derived from its business (see `RX-OCCUPANT-PLAYBOOK.md`), so the player is judging:

- **Quick wins** — a courier or a refuel stop. Small, certain, fast, low margin.
- **Long commitments** — an overhaul that ties up a berth and eight bunks for three days. Pays well, and it is *load* you cannot take back.
- **Uncertain ones** — a liner with a damaged drive that *might* become a long stay. The gamble.

Three properties make this a real decision rather than a menu:

1. **Capacity is finite and shared.** Accepting a long job spends berth, bunks, food and staff attention that the next three offers will also want.
2. **Information is partial.** You are reading cues and betting, not computing.
3. **Refusal has a cost** — the fee foregone, and the faction remembers. Declining everything is not a strategy.

**Committed load should be visible as a forward silhouette** — how much of your bunk and berth capacity is already spoken for over the coming days — so the player can see they are over-committing *before* the crowd arrives, not after. This is the one panel-like affordance the spec permits, because it describes the future, which cannot be observed by watching the world.

### 3.6 Failure is visible behaviour, never a number

Non-negotiable, and it is the rule the whole design is judged against:

- A hungry occupant who cannot get served **queues visibly, then gives up and walks out** — with a legible reason.
- A long-stay occupant with nowhere to sleep **visibly has nowhere to sleep**.
- A misrouted occupant **visibly goes to the wrong place** and comes back.
- **A stranded crew that cannot be fed is a compounding problem**, not a rating tick. People who cannot leave create stakes transients cannot.

If a consequence is only observable in a panel, it does not count as shipped.

---

## 4. Prerequisite — uncap before adding

**No new system in this spec will be felt until the existing ceilings are lifted.** Verified in code:

| Cap | Location | Change |
|---|---|---|
| `QUEUE_CHAIN_MAX_SPILL = 6`, `QUEUE_BALK_LENGTH = 12` | `sim.ts:7949` | raise substantially; let queues snake |
| `occupancyPenaltyForIntent` `min(1 / 2.5 / 3)` | `path.ts` | let congestion keep rising |
| resident discomfort `clamp(0, 8)` | `sim.ts:4364` | raise |
| walk penalty `MAX_PER_TRIP 0.1`, threshold 30 | `sim.ts:406-408` | raise; add an actual give-up |

The `layout-lab` testbed (`bmo.ryanboye.com/layout-lab/`) already demonstrates each of these as live sliders; V1 and V5 show the before/after directly.

---

## 5. Build phases

Each phase is independently shippable and independently useful.

### Phase 0 — Uncap (hours)
Lift the four ceilings above. **Acceptance:** a deliberately bad layout produces a visibly bad station; a queue can snake down a concourse.
*Note: uncapped serves slightly fewer people than capped — this is correct. It reveals a backlog that was previously hidden, it does not create one.*

### Phase 1 — Slots everywhere (days)
Port the cafeteria's queue/serving-slot system to the market stall. Make beds claimable slots with occupancy and duration.
**Acceptance:** one market stall can be overwhelmed; a second stall is a decision with a visible effect; two occupants cannot use one bed.

### Phase 2 — Stay classes (days)
Introduce `stayClass` and `departsAt`. Wire long-stay occupants to the existing resident lifecycle. Derive class from the origin ship's business.
**Acceptance:** a repair job produces a crew that stays for days, sleeps, eats repeatedly, and visibly needs somewhere to do both. A dry-dock station and a liner port feel different to run.

### Phase 3 — Hidden demand + reception (the new system, ~1–2 weeks)
Remove spawn-time itinerary rolling. Add hidden wants, ship-archetype cues, a capacity-limited reception, and unprocessed-guess behaviour.
**Acceptance:** the player can point at the reception and say why they are widening it; misrouted occupants are visible; two sessions on the same layout differ because the arrivals differed.

### Phase 4 — Polish
Re-weight `planVisitorLeisureLegs` so multi-leg visits are the norm. Placement juice: snap, ghost preview **of the effect**, a sound on commit. Thought-bubble + click-to-follow on a stalled occupant.
*Phase 4 is explicitly **not** the fix — it is the cheap ~20% and must not be mistaken for the answer.*

---

## 6. Reused vs new

**Reused (the majority):** `ResidentState` lifecycle · regenerating `hunger`/`energy`/`hygiene` · `ResidentRoutinePhase` · `serveTimer` provider slots · `ARCHETYPE_PROFILES` · `spawnVisitor` · pathing and queue-chain construction · port-ops customs (becomes reception) · patience / walk-off theatre · `maybeConvertVisitorToResident` (`sim.ts:6030`, already exists).

**Genuinely new:** hidden-want state and the reveal · reception capacity and the unprocessed-guess branch · `stayClass`/`departsAt` and ship-business→class derivation · bed and market-stall slot occupancy.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| **More agents on screen** — long stays mean a larger resident population | Perf-test early. Note this is also the crowding pressure the game currently lacks. |
| **Hidden becomes random** — unreadable variance reads as noise | Ship archetypes must be strong, consistent tells. Test that a player can predict roughly before revealing. |
| **Long stays become tedium** — a bored crew wandering forever | Needs must be satisfiable and the loop must have an end; stays are bounded except for residents. |
| **Reception becomes a chore** | It must be a *capacity* decision (build another desk), never per-occupant clicking. |
| **Phase 4 mistaken for the fix** | Stated explicitly above. |

---

## 8. Out of scope

Decoration/prestige scoring · per-item stockpile filters · labour-priority spreadsheets · an event/AI director as the primary engine (it needs heavy authoring and repeats — fatal for a station with no resets) · any "pick your identity" menu.

---

## 9. Decisions — settled (owner, 2026-07-27, tentative pending playtest)

1. **Phase order approved — and phases 0/1 are the experiment, not merely groundwork.** Uncap, give the market real slots, then *play it*. If an overwhelmed market with a snaking queue still feels dead, that is evidence against the thesis at a cost of two days rather than two weeks. **Gate phase 3 on how phase 1 feels.**

2. **A failed long-stay does NOT cost rating — the occupants stay and get worse.** Rating is a hidden number, which is the disease this whole spec exists to treat. Instead, unmet long-stay occupants become a visible, compounding presence: loitering, clogging, angry, eventually causing incidents. **A tourist you fail is a quiet lost sale; a repair crew you fail is still standing in your concourse tomorrow.** That asymmetry is the reason long stays are worth having at all.

3. **Yes — refusal is the spine of the game, expressed as a portfolio choice over the offer list.** See §3.5. *"This overhaul pays well and ties up a berth plus eight bunks for three days — take it?"* Without refusal, arrivals are weather; with it, they are decisions. Reuses the existing `trafficOffers` / `manualTrafficAdmission` system.

4. **Yes — and this is the growth engine, which is bigger than the question implied.** A good stay converting an occupant into a permanent resident means **success permanently raises the baseline load**: serve people well → more residents → more standing demand → the station you built stops being big enough → you rebuild. That is Mini Metro's endogenous-growth engine arriving through the fiction rather than as a rule, and it is what stops the game ever reaching a finished, static state. It also makes the permanent population **earned** — composed of people the player looked after — which is where the caring comes from. `maybeConvertVisitorToResident` (`sim.ts:6030`) already exists.

5. **Reception stays, but reframed: the reveal is free-but-slow by default, and reception buys it earlier.** Never a mandatory gate. And it reveals **some, not all** — partial reveal keeps discovery running for the whole visit.

**Still open, for playtest to answer:** exactly how harsh the compounding failure in (2) should get before it stops being interesting and starts being punishing.
