# Scope: System Map

**Status:** drafting
**Owner:** awfml
**Depends on:** none (this is the foundation layer)
**Blocks:** `contracts.md`, harvest extension, faction relationships

## TL;DR

Add a second scale of map above the playable station grid: the **star system** the station orbits in. The system contains a sun, planets, asteroid belts, factions, and (later) rival stations. Each save's system is procedurally generated from the seed and frozen for that save's lifetime. The system **shows the player where their station is and why this place is worth being** — and becomes the data source for randomness that today is hardcoded (lane traffic biases, future contract origins, future harvest opportunities).

The station does **not** move. Harvesters and ships dispatch from the station, travel through the system, and return. The station "lives in a place for a reason."

## The frame — what the player experiences

```
Three scales of map:

  [station map]   ← the 60×40 build grid we have today
  [outer hull]    ← lanes + parallax around the build grid (lightly fictionalized today)
  [SYSTEM MAP]    ← new: the star system the station orbits in
```

A new top-bar button or hotkey opens the **System Map**. It shows:

- **The station** — your station, at its spawned location in the system. A pip with the station name.
- **The sun** — center or off-center; lighting/heat affects nothing mechanically (for now), but anchors the visual.
- **Planets** — 2–6 named bodies at orbit distances. Each has a polity affiliation and a base resource type.
- **Asteroid belts / fields** — between or around planets; the source of harvestable raw materials.
- **Factions / polities** — owners of planets and lanes. Their territorial reach is shaded on the map.
- **Lanes** — the four space lanes (north/east/south/west) project outward from the station and *cross specific factional territory*. This is what biases ship arrivals: north lane crossing the Trader Guild's holdings means you get more traders from the north.
- **Distant resources** — tagged points the player can dispatch harvesters to (later scope).

The player consults the System Map to:

1. Understand why arrivals look the way they do ("oh, my east lane points toward Industrial Combine territory — that's why so many materials freighters").
2. Decide where to dispatch harvesters (later — see `Future scope`).
3. See faction relationships (later — see `contracts.md`).
4. Pick a starting position when starting a new game (later — see `Open questions §3`).

The map is not real-time interactive (no pan-and-shoot, no orbits-update-each-tick). It's a static, legible diagram that updates only when the system state changes (a faction's territory shifts after a contract chain; a harvester's location pip moves between dispatched and returned states).

## In scope (this scope doc)

- A procedurally generated star system per save, seeded from `state.seed`.
- Sun + 2–6 planets + 1–3 asteroid belts.
- Faction/polity assignment per planet (3–6 factions per system).
- Lane projection: each of the four cardinal lanes maps to a directional vector through the system, intersecting specific factional territory.
- **Replacing the hardcoded `generateLaneProfiles` weights** (`src/sim/sim.ts:262`–283) — lane biases now derive from "what factions does my north lane cross?", not from a hardcoded "north=leisure, east=trade".
- A new top-bar button + hotkey opening a System Map modal.
- A read-only render of the system as a labeled diagram.
- Save schema bump (v3) to persist system layout (or to redrive deterministically from seed).
- New game screen showing the rolled system before commit (player can see what they're about to play in).

## Out of scope (this doc)

- Station movement — explicitly punted. Station stays where it spawns.
- Real-time orbital mechanics. Planets do not orbit the sun visually.
- Combat / fleet engagements at the system scale.
- Multiple saved systems / inter-system travel. One save = one system.
- Contracts (separate scope: `contracts.md`).
- Harvester dispatch (sister scope, will follow once system-map ships).
- Faction diplomacy beyond "this lane crosses their territory." (Faction *favor*, treaties, etc., are downstream.)
- Procedural escalation of system content over time. The system is rolled once at new-game and frozen.

## Touches in the existing game

| What | Where | How it changes |
|---|---|---|
| Lane traffic bias | `src/sim/sim.ts:262`–283 (`generateLaneProfiles`), `docs/07-docks-ships.md:25`–35 | Bias now derived from system-map territory, not hardcoded "north=leisure" |
| Save schema | `src/sim/save.ts`, `docs/12-ui.md` save section, `docs/99-trip-wires.md` save trip-wires | New v3 with `state.system` block; v2→v3 migration writes a "vanilla" system for old saves |
| Initial-state setup | `createInitialState` (`sim.ts:7005`) | New step: roll system from seed, then call `generateLaneProfiles` reading from system |
| New-game flow | `main.ts` (currently no real new-game UI; cold-start scenarios via `?scenario=`) | New "Start New Game" modal with system preview |
| UI top bar | `main.ts:85`–~210 | New `#open-system-map` button + hotkey (proposed: `Y` — currently unbound for tools) |
| Sprite atlas | `public/assets/sprites/atlas.png`, `docs/13-pipelines.md` (sprite pipeline section) | New atlas keys for sun, planet, asteroid-belt, faction-sigil sprites — small set |
| `state.seed` discipline | `sim.ts:7005`, no current docs entry | Locks down PRNG semantics (currently undocumented); flagged in `docs/99-trip-wires.md` as a doc gap during v2 review |

## Integration points

- **`contracts.md`** consumes faction identities from this scope. A contract reads "this offer comes from [faction X]" — faction X is a record on the system map.
- **Future harvest scope** consumes resource node positions from this scope. A harvester dispatched to "the asteroid belt at coordinate [X,Y]" requires those coordinates to exist on the system map.
- **Existing `LaneProfile`** changes shape: instead of hardcoded weights, it reads computed weights from "which faction does my lane cross." See `docs/07-docks-ships.md:25` for current behavior.
- **Existing tier-progression** stays untouched. T6 still has its predicate problem — that's resolved by future harvest scope, not this one.

## Open questions / decisions needed

### 1. How are factions seeded? Curated or fully procedural?

**Options:**
- **(a) Hand-author 6–10 faction templates** (Trader Guild, Industrial Combine, Colonial Authority, etc.); roll 3–6 of them per save.
- **(b) Fully procedural** — name + sigil + ship-bias + flavor are all generated from seed. Maximum variety, minimum hand-content.
- **(c) Hybrid** — hand-authored *archetypes* (e.g., "trader", "industrial"); per-save procedural skin (faction name + sigil + minor stat variance).

**Recommendation:** (c). Archetype gives mechanics consistency; skin gives "every save feels different."

### 2. Should planets have unique mechanics, or are they purely flavor?

**Options:**
- **(a) Pure flavor** — planet names + faction ownership tags only. The mechanics are at the *faction* level.
- **(b) Mechanics per planet** — each planet has a stat (e.g., "Trade Hub" boosts contract reward, "Pirate Haven" raises wealth-trouble pressure when nearby).

**Recommendation:** (a) for v1. Adds variety without authoring cost. Punt (b) until contracts ship and we know what mechanics need a per-planet hook.

### 3. Does the player choose their spawn position, or is it rolled?

**Options:**
- **(a) Rolled** — system map shows your station's location post-roll. Reroll seed = reroll location.
- **(b) Choose at new-game** — system map shows 3–5 candidate locations with different proximity profiles; player picks one (Surviving Mars sponsor pattern).
- **(c) Rolled but biased** — system rolls a layout, then offers the player 1 of 3 positions within that layout (compromise).

**Recommendation:** (b). Lets the player commit to an identity ("I'm starting near the Industrial Combine border") before committing to the build. Costs a new-game screen, which we don't have anyway. Worth doing.

### 4. What does "lane crosses territory" actually mean mathematically?

**Options:**
- **(a) Ray-casting** — each lane is a ray from station outward; for each faction, compute which segments of which rays intersect its territory polygon.
- **(b) Sector-based** — divide the system into 4 quadrants matching the 4 lanes; each quadrant has a list of factions/resources within it.
- **(c) Distance-weighted** — every faction in the system contributes to every lane, weighted by `1 / (1 + distance_from_lane)`.

**Recommendation:** (b) for v1. Simplest model, easy to telegraph visually ("your north sector contains Trader Guild + Pleasure Syndicate"). (c) is more sophisticated but harder to explain. Punt (c) until we hear "the lanes feel too binary" feedback.

### 5. How does the System Map affect the build grid? (Answer: not at all. But spell it out.)

The system map is a *backdrop* for randomness. It doesn't generate tiles, change pressurization, or affect tile placement. The build grid stays exactly as it is today (`docs/02-build-and-world.md`). Pressurization, pathing, and the existing render pipeline are unaffected. **This is critical** — fully randomizing the buildable grid would cascade through every existing system (`docs/99-trip-wires.md` cites `expandMap`, pressurization, demo-station overlay, harness scenarios). System map = "the world around the grid" only.

### 6. Should rival/neighbor stations exist in v1?

**Options:**
- **(a) No.** v1 is sun + planets + factions + asteroid belts only. Rival stations are downstream content.
- **(b) Yes, as flavor** — show 1–3 rival stations on the map with names, but no mechanics.
- **(c) Yes, with mechanics** — rival stations could send "competing arrival" ships that bias which lane is busy.

**Recommendation:** (a) for v1. Rival stations are a juicy hook for future scope but adding them now expands the system-map scope by a lot. Cut for now, mention as a future-scope candidate.

## Player-facing examples

### Example A: New game flow

> Player clicks "New Game." A System Map preview appears: a small star system with 4 planets — one named *Hesperus*, one *Voraxa*, one *Tenebris*, one *Auriel*. Each has a faction sigil (Trader Guild owns Hesperus + Auriel; Industrial Combine owns Voraxa; Colonial Authority owns Tenebris). The player sees three candidate spawn locations as glowing pips. They pick the one near the asteroid belt between Voraxa and Tenebris — closer to industrial traffic, further from tourist trade. They click confirm. The build grid appears as today.

### Example B: Mid-game inspection

> Mid-game, the player notices a wave of trader ships arriving from the north lane. They open the System Map (`Y`). The map shows their station with the four lanes projecting outward; the north lane projects through Trader Guild territory. "Ah, that's why." They consider painting more Market on the north side of the station. Closing the map, the build grid is unchanged.

### Example C: Why arrivals shift after T6

> The player reaches T6. A future scope's contract chain shifts a planet's faction from Industrial Combine to Free Port (the system map is mostly frozen, but specific events can flip ownership). The next time the player checks the System Map, the western planet now shows the Free Port sigil. Their west lane traffic profile changes accordingly — fewer materials freighters, more luxury traders.

## What this scope explicitly retires

- **The hardcoded `generateLaneProfiles` "north=leisure, east=trade, south=generic, west=industrial" bias** (`sim.ts:262`–283). This becomes data-derived from the system layout. The function still exists, but reads from `state.system` instead of a constant table.

## Future-scope hooks (what comes after this)

- **`contracts.md`** — contracts come *from* faction-aligned planets. A contract carries "issued by Trader Guild on Hesperus" metadata. Player accepts → station's relationship with that faction shifts. Specific to that scope; out of scope here.
- **Harvester dispatch** — a future scope adds modules that build *harvester drones*. A drone dispatched to an asteroid belt travels through the system map (animated pip), arrives, harvests for N cycles, returns to dock with cargo. The system map becomes the dispatch target picker.
- **Rival stations** — future scope; see Open Question §6.
- **Faction diplomacy** — future scope; favor systems, treaties, embargo events.
- **Procedural escalation** — future scope; events that *change* the system over time (a planet revolts and changes faction; a pirate cluster spawns; an asteroid belt depletes).

## Risks &amp; gotchas

- **Save migration is real.** v2 → v3 needs a default "vanilla" system for old saves. Without it, every existing save tanks. Per `docs/99-trip-wires.md` save trip-wires.
- **PRNG discipline must be settled before this ships.** Every system is rolled from `state.seed`; if subsystems share or branch the PRNG inconsistently, save-load deterministic replay breaks. This was flagged as a doc gap during v2 review and should be answered (in `docs/`) before this scope locks.
- **The system map is a new render surface.** Not the per-tile canvas — likely a separate canvas or DOM-rendered SVG. Keep it simple (static labeled diagram); don't draft a full strategic-map UI in v1.
- **The "where station spawns" UI requires a new-game flow we don't currently have.** Today, new game = clear localStorage + `?scenario=`. Adding a real new-game modal is a small project of its own.
- **Faction names + flavor text are content authoring.** Hand-authored archetypes (Open Q §1c) keeps this manageable but still needs ~6 faction names, sigils, and flavor strings.

## Definition of "scope locked"

This scope is locked once the team agrees on:

- The 6 open questions above.
- The "in scope" / "out of scope" lists are accepted as-is or amended.
- The lane-bias retirement is committed to (`generateLaneProfiles` rewrite is in this scope, not deferred).

Once locked, an implementation plan gets drafted as a separate doc. This file then becomes a reference, not a working doc.
