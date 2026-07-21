# Fifty-Crew Scale Playtest

Date: 2026-07-21  
Branch: `codex/two-berth-shift`

## Run reached

- 50 crew with 52 usable crew sleep slots.
- 50/50 crew payroll remained affordable with more than 2,000 credits in reserve.
- 51 concurrent visitors observed after the final performance pass, with five ships docked.
- Six arrival facilities: four room berths (including a new 42-tile large berth), one colonist-only residential dock, and one small tourist/trader dock.
- Large berth active with gangway, customs, and cargo capabilities.
- Five permanent residents, valid private housing, and a working residential berth completed the habitation arc.
- Tier 6 completed and the progression UI reports all tiers unlocked.
- Global revenue and visitor goals completed. Perfect turnarounds remained at 2/12.

The verified final named save is `Codex Scale Run - Final Tier 6 Smooth`. It reloads with 50 crew, 100% oxygen, active ship manifests, and Tier 6 intact. Visitors are transient by save design and repopulate from the saved ships after resuming play.

## Fixes made during play

1. Resident shuttles now release their dock after a short drop-off dwell. Previously the first resident permanently consumed the only residential dock and blocked progression.
2. Dedicated crew-policy dorms are valid crew sleep targets even when a restricted dorm exists elsewhere. Previously an unrelated restricted room could hide all dedicated crew beds.
3. Room pressure readiness evaluates the fixtures occupants actually use. Airlock or access tiles no longer make a sealed, pressurized dorm or hygiene room appear half unpressurized.
4. Life support can activate before its own room is pressurized, removing the circular bootstrap where the room needed air before it could supply air.
5. Tier 6 now unlocks after Tier 5 instead of being permanently disabled.
6. Permanent residents are serialized and hydrated instead of disappearing on reload.
7. Resident move-in rolls now gain bounded pity after failures, preventing a completed habitation build from stalling indefinitely.

## Performance pass

The 50-crew save initially spent 11-13 ms on routine simulation work and periodically collapsed into 430-480 ms frames. The collapse came from more than 5,000 A* requests in one update: every tired worker evaluated every bed and every departing visitor evaluated every berth tile.

The final architecture separates presentation from simulation:

- Canvas rendering remains requestAnimationFrame-driven and typically costs 8-10 ms in the scale save.
- Simulation advances at a fixed 15 Hz. Actor positions interpolate at render frequency, so 1x/2x/4x changes world speed without changing visible movement cadence.
- Catch-up is capped at one simulation slice per frame. Stale backlog is dropped instead of entering a multi-update spiral that freezes rendering and input.
- Full metrics, room operations, and the local oxygen field refresh at 4 Hz; job creation retains its existing simulation cadence.
- Shared room/fixture snapshots are computed once per update instead of once per crew member.
- Destination selection ranks all targets cheaply, then runs A* for only the four best candidates.
- Logistics source/destination matching uses Manhattan distance across the candidate set, then validates only the pair it will commit.
- Crew dispatch scores the whole job board cheaply, then route-checks only the six best jobs per worker rather than every worker/job pair.
- Failed crew and visitor route auctions have deterministic cooldowns instead of retrying every update.
- Each actor has a stable visual pace curve and subtle perpendicular lane offset between tile centers. Simulation occupancy remains exact while crowds avoid lockstep beelines.

Measured result: after warm-up, the same 50-crew/51-visitor scene rendered mostly at 15.8-17.7 ms rAF intervals. Routine simulation slices fell to roughly 8-15 ms and rendering stayed near 9-11 ms. The old 430-480 ms collapse is gone; sustained 4x sampling still found occasional 33-50 ms presentation frames when a 20-43 ms diagnostic/air slice occupied the main browser thread. This is a strong baseline, but not yet proof for the desired 100-150 crew and visitor endgame.

The approach matches established large-simulation practice: avoid pathfinding when a cheap heuristic works, cache or reuse similar routes, budget expensive path work across updates, keep a fixed simulation timestep, and interpolate presentation between snapshots. The timer split is not a true thread boundary: simulation and canvas still share the browser main thread. A Worker requires converting direct UI mutations into commands and publishing immutable render snapshots, but it is now the appropriate next architecture pass because profiling has identified real main-thread contention. Parallel work still needs careful data ownership; shared mutable state and full-world copies can erase the benefit.

## Live balance findings

### What held up

- Scaling from 30 to 50 crew remained financially viable.
- A mixed roster could support 14 Service, 8 Cargo, 5 Maintenance, and 8 Cleaning assignments while retaining 15 flexible workers.
- The new crew barracks immediately contributed 12 real sleep slots and was recognized as sealed, 100% pressurized, reachable, and active.
- The private dorm reported a valid private loop once connected to resident hygiene.
- Traffic automation correctly held large ships until a large berth existed, then had a compatible active berth available.
- Tiny ships remained on Dock tiles while medium and large manifests required room berths.

### What strained or failed

- Crew needs stayed high at scale despite spare labor: roughly 21 needed drinks, 28 toilets, and 20 washing. Fixture throughput and travel distance, not headcount, became the limiting factor.
- During the final arrival wave, 49 crew could be waiting for fixtures while Service and Cargo work reported no active workers. Self-care needs can starve the station's economic loop too completely; shifts need protected duty floors and staggered break scheduling.
- One cafeteria serving line still accumulated six waiting visitors with multiple Service crew active. A second serving counter or a larger serving capacity is required for 50-plus population traffic.
- Air remained at 100%, but more than 350 tiles reported poor life-support coverage. The station survived, yet the warning was too broad to distinguish harmless remote deck tiles from occupied risk areas.
- The first residential milestone is paced by a random move-in check every 20 seconds. The loop works, but failed rolls make the final two residents feel idle after the player has already supplied every requirement.
- Three medium/large ships could saturate the original berths while more manifests waited. The large berth was a meaningful expansion decision rather than cosmetic capacity.
- New hires can only be placed on unoccupied walkable tiles. At 50 crew the placement workflow becomes tedious and should eventually support arrival through a hiring shuttle or automatic placement at a valid entry.
- The 52-slot dorm capacity technically supports 50 crew but leaves no shift buffer. A healthy large station should target at least 60-65 sleep slots for this roster.

## Recommended next balance pass

1. Add a second cafeteria serving station and a second cantina drink provider before increasing traffic beyond rate 2.
2. Add another crew hygiene block near the barracks. At this scale, toilets and showers should be distributed by district instead of concentrated in one remote room.
3. Change the air warning headline to count occupied or service-critical poorly supplied tiles first, with total tile coverage in the overlay details.
4. Preserve some uncertainty in resident attraction, but add pity progression after consecutive failed move-in rolls once all Tier 5 requirements are satisfied.
5. Add bulk hiring placement or spawn hired crew at the nearest valid dock/airlock.
6. Keep the large berth expensive and spatially demanding. It produced the clearest new planning decision in this run.
7. Add district-level service capacity summaries and break scheduling before expanding to 100-plus crew. The player should see demand per minute, fixture throughput per minute, travel loss, and queued crew by district.
8. Treat 100-150 crew plus comparable visitors as the next performance acceptance scene. Add a deterministic scale fixture and budgets for simulation p95, presentation p95, path requests per slice, and longest route job.
9. Introduce a Worker-owned simulation state through an explicit command queue and compact render snapshots. Keep interpolation and cosmetic gait variation in the main-thread presentation layer.

## References for the next architecture pass

- [Factorio FFF #117](https://www.factorio.com/blog/post/fff-117) and [#121](https://www.factorio.com/blog/post/fff-121): avoid unnecessary pathfinding first, then reuse similar paths through a cache.
- [Factorio FFF #36](https://www.factorio.com/blog/post/fff-36) and [#317](https://direct.factorio.com/blog/post/fff-317): time-slice path requests and use an abstract/hierarchical route graph for large worlds.
- [Factorio FFF #215](https://www.factorio.com/blog/post/fff-215) and [#421](https://www.factorio.com/blog/post/fff-421): multithreading is not automatically faster when systems share mutable memory; reorganize data and measure before moving work across threads.
- [Unity fixed-timestep guidance](https://docs.unity3d.com/jp/current/Manual/physics-optimization-cpu-frequency.html) and [interpolation guidance](https://docs.unity3d.com/cn/2022.1/Manual/rigidbody-interpolation.html): cap fixed updates to avoid catch-up spirals and interpolate visual positions between discrete simulation states.
- [Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/): bound catch-up work and render between fixed simulation snapshots.
