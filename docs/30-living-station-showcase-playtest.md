# Living Station Showcase Playtest

Date: 2026-07-21  
Branch: `codex/two-berth-shift`  
Save: `Codex Living Station Showcase - Fuel & Watches`

## Purpose

Exercise the legibility, living-crowd, watch, hospitality, security, sanitation,
and fuel work together in the existing Tier 6 scale station. The test was run
through the visible localhost game, not only through deterministic scenarios.

## Saved Showcase

The final named save opens paused at 1x with:

- 50 crew and 52 sleep slots.
- 45 live visitors and two active large-ship turnarounds.
- All six progression tiers unlocked and the regional-hub goal complete.
- Multiple small docks and large berths, with passenger, mixed, and freight
  traffic represented.
- Crew quarters, cafeteria, cantina, lounge, market, workshop, medical,
  security, life support, public bathrooms, and crew bathrooms.
- 10 toilets, 9 showers, 9 sinks, 9 beds, 26 bunks, 6 dining tables, 3 serving
  stations, 2 water fountains, 4 bar counters, 2 cargo arms, a fuel tank, and
  a berth fuel pump.
- Healthy baseline state: 81% mood, 100% oxygen, 71 prepared meals, 1,924
  credits, and full movement speed.

The save now persists individual crew positions. Older saves distribute crew
across bunks, beds, and open non-berth floor instead of stacking the whole
roster on one fallback tile.

## Systems Exercised

### World and crowd

- Crew and visitors visibly used tables, toilets, showers, sinks, fountains,
  lounges, quarters, and public routes.
- Need speech, icons, room occupancy labels, queue labels, and berth progress
  made crowd behavior readable without opening actor inspectors.
- The three-watch strip produced distinct passenger, cargo, and maintenance
  windows with on-duty, reserve, and off-duty counts.
- Theft and trespass incidents appeared in the world and assigned security
  responders with a visible response phase and location.

### Hospitality and berths

- Two simultaneous large-ship turnarounds exposed promises beside their berth:
  meals, drinks, lounge, restroom, wash, comfort, passenger return, and freight.
- The turnaround report named individual failures and offered a relevant
  adaptation instead of collapsing the result into a generic score.
- Small docks remained distinct from large berths.
- Approach Control communicated ship type, risk, berth fit, crew plan,
  facilities, economics, and the current automation policy.

### Fuel

- A supplier manifest requested 73 inbound fuel and explicitly displayed the
  route `cargo arm -> fuel tank`.
- Cargo unloaded, fuel loads moved physically, storage rose from `0/160` to
  `73/160`, and the contract completed `73/73` fuel received.
- Settlement reported `+352c gross`, `-164c supply`, and `+188c net`.
- A later customer manifest requested 46 outbound fuel and displayed the route
  `fuel tank -> berth pump`. It could not be assigned while every compatible
  medium berth was occupied. That was a clear, physical capacity constraint,
  not a hidden rule.

### Diagnostic overlays

- **Air Coverage:** persistent oxygen state and distance/reliability coloring
  make a lethal mechanic visible. The `315 poorly supplied tiles` headline is
  too noisy at 100% oxygen and needs a more meaningful threshold.
- **Guest Appeal:** communicates appealing public space versus industrial or
  uncomfortable space. The rename from `Visitor Needs` better matches what the
  overlay actually measures.
- **Cleanliness:** clearly shows average, maximum, dirty/filthy counts, open
  jobs, severity colors, and source/effect on hover. It exposed one 84%-dirty
  concourse tile and six cleaning jobs immediately.
- **Foot Traffic:** the strongest scale lens. It showed 66 active paths across
  224 tiles and 107 mixed-route conflicts, split into visitor, resident, crew,
  and logistics traffic.
- **Security & Risk:** the rename is more honest than `Security`; the current
  lens is local prestige, notoriety, value, and crime pressure. It is not yet a
  responder-coverage or patrol-time overlay.

## Bugs Found and Fixed

1. **Paused save hydration discarded the roster.** A paused tick could return
   before rebuilding crew, then the loader had no entities on which to restore
   saved needs. Crew, residents, and dock entities now hydrate before the
   derived-metric cadence gate.
2. **Crew positions were not saved.** Reloading placed all 50 crew on one tile,
   creating false path failure and catastrophic synchronized needs. Crew tiles
   are now serialized and restored, with a distributed legacy fallback.
3. **Sinks disappeared when any shower existed.** Hygiene targeting selected
   showers *or* sinks, so this station's nine sinks contributed no capacity.
   Crew now use both; showers remain faster providers.
4. **Routine needs looked critical.** The red alert previously treated ordinary
   self-care trips as crises. Critical now uses the same severe thresholds that
   affect movement and resignation strain, and the alert includes its count.
5. **Overlay names overstated their semantics.** `Visitor Needs` became `Guest
   Appeal`; `Security` became `Security & Risk`.

## Readability Assessment

The pass succeeds at its main objective. I could diagnose five separate failure
classes from the normal play surface: meal pickup, fixture capacity, berth-class
availability, cargo labor/route load, and sanitation. Before this work, those
would mostly have required debug metrics or code inspection.

The best information is local and actionable:

- room labels such as `RESTROOM 1/10 IN USE - 1 WAITING`;
- thoughts such as `I need a break` and `I'm hungry`;
- berth promise progress beside the physical ship;
- alerts that focus the affected tile;
- route and sanitation overlays that answer a specific planning question.

The weakest information is still aggregate or ambiguous:

- `Bridge inactive` in the sanitation legend sounds like cleaning is disabled
  even while cleaning jobs and workers are active;
- air warnings remain persistent when oxygen is globally healthy;
- normal-view dirt is mostly a procedural tint/indicator and is easy to miss;
- the route overlay becomes visually dense at this population and needs a way
  to isolate one route class;
- the Security & Risk overlay does not show guard reach or response time.

No new generated art was necessary for this run. Existing authored module and
ship sprites carried the fuel and facility additions. Dirt presentation still
uses the existing procedural floor treatment; stronger authored grime/debris
variants remain worthwhile because normal view currently understates dirt.

## Balance Findings

Traffic rate 3 is not a steady-state setting for this build. One supplier was
processed successfully, but the combined visitor bank and 50-crew watch rhythm
created a large meal and self-care wave. The UI correctly exposed the wave, yet
the recovery test showed that service throughput remains too concentrated in a
few one-tile providers.

This is partly good pressure: the player should need a larger mess hall and
distributed bathrooms at this scale. It is also partly implementation debt:

- serving counters accept only one actor on one physical tile even when the
  artwork and intended room scale imply a wider service face;
- crew self-care is heavily threshold-driven, so watch changes can synchronize
  demand despite varied starting needs;
- long on-duty periods defer routine care until several needs become urgent;
- compatible berth classes can block a valid fuel customer even while other
  berths are idle, but Approach Control explains this well.

Traffic rate 1-2 is the current sustainable operating range. Rate 3 works as a
deliberate surge test and should remain capable of overwhelming a poorly sized
station.

## Recommended Next Pass

1. **Scale service faces, not module spam.** Give serving counters, bars, sinks,
   and similar large fixtures multiple authored interaction positions where the
   artwork supports them. Preserve physical occupancy and visible queues.
2. **Add overlay filters.** Foot Traffic should toggle visitor, resident, crew,
   logistics, and conflicts independently. Add guard coverage/response time to
   Security & Risk.
3. **Tune watch staggering.** Add per-crew routine offsets and let reserve crew
   take routine care before a hard threshold. Keep the visible rush, but avoid
   every watch becoming an unrecoverable synchronized queue.
4. **Strengthen normal-view grime.** Use authored grime/debris decals by source
   and severity, while keeping Cleanliness optional as the precise diagnostic.
5. **Refine warning thresholds.** Suppress the persistent air headline when
   oxygen is healthy and weak coverage is not causing a meaningful room risk.
6. **Keep deepening existing loops.** Fuel proved that physical supply, storage,
   labor, berth fit, and resale can create real station-scale decisions. Build
   repair/refuel depth on that pattern before adding another independent system.

## Verification

- Production TypeScript/Vite build passed with `npm run build`.
- Targeted save replay and visible localhost play covered load hydration, crew
  movement, watches, needs, two active berths, fuel receipt, incidents, and all
  five player-facing diagnostic overlays.
- The full test suite was intentionally not run during this live iteration.

