# Living Station: Legibility And Needs Depth

Status: proposal for the next depth slice. Subordinate to `docs/23-operational-promise-core-loop.md` (design authority). Produced by a full design/architecture review on 2026-07-21.

## Purpose

The last two slices (Two-Berth Shift, Crew Sustainability) proved the loop and proved that world-visible causes and effects (speech bubbles, queues, countdown strips) are the unlock. This slice finishes that job in two moves:

1. **Surface the simulation the game already runs.** Several deep systems (sanitation, maintenance, air, thermal, mood) tick correctly but are invisible or panel-only. Render them in the world before adding any new mechanics.
2. **Close the physicality gaps in the needs layer.** Crew already use fixtures Prison-Architect-style; visitors already queue at cafeterias. Extend the same machinery to residents, to other providers, and to ambient behavior (milling, rush-hour rhythm) so the station reads as continuously alive.

Nothing in this slice adds a new simulation system. It converts existing state into visible, spatial, reactive gameplay — then we decide what to prune versus deepen.

## Review Findings (2026-07-21)

### The needs layer is deeper than it looks

- Crew needs (energy, hygiene, bladder, thirst, morale) are continuous floats with decay, thresholds, and **timed fixture use**: a crew member walks to a specific reserved Toilet/Shower/Bed, occupies it for real seconds at a fixture-specific relief rate, then leaves (toilet: `sim.ts` ~12951-12986; reservation capacity check ~11007-11018; `MAX_USERS_PER_USAGE_TILE = 1`).
- Visitors follow manifest-driven service itineraries and use a real physical queue system — ordered wall-hugging chains, counter-slot rate limiting, corridor spill caps, and priced balking (`buildQueueChain` ~8152, `joinCafeteriaQueue` ~8261) — **but only for Cafeteria serving stations**.
- **Residents are the weak population.** Sleep, hygiene, and leisure resolve by room-presence plus global `mealStock`/`waterStock` scalars (~16079-16107). They never reserve a bed or shower even though the crew fixture machinery (`ensureCrewUsageTarget` ~9922, provider-slot reservations) is directly reusable.
- Tile occupancy is soft by design (hard caps deadlocked doors; comment at ~9738-9743). Agents can stack; crowding is only a path-cost penalty.
- No day/night. Crew "shifts" are a 10-second rest-stagger (`shiftBucket`, ~355-356). Residents share one synchronized 120s routine clock with no per-agent offset, so the whole population moves in lockstep.
- Crew have no hunger need — they never use the cafeteria.

### The simulation is deeper than the screen shows

- **Sanitation is already Prison-Architect-grade in the sim**: per-tile `dirtByTile: Float32Array` with source attribution, severity tiers, and crew who physically walk to clean ranked dirty patches (`updateSanitation` ~10967, `createSanitationJobs` ~10816). Floor grime/wear decals DO render (`pickFloorOverlayKey`, decorative layer) — but only past dirt ≥ 25, and playtesting reads as "nothing ever looks dirty." Either accrual, cleaning cadence, thresholds, or decal contrast needs tuning; the mechanism itself exists.
- **Module condition is the biggest data-to-render gap.** `MaintenanceDebt` tracks per-module debt with anchor tiles, but `drawModuleVisual` never swaps or overlays a module sprite by condition. Machines never look worn, strained, or broken outside the toggled maintenance overlay and the wrench badge. The decorative layer already composites decal overlays (floor grime, hull wear), so `overlay.module.wear.*` decals are a single draw hook + atlas art.
- **Agent mood overlays are contracted but absent**: `AGENT_OVERLAY_SPRITE_KEYS` (distressed/critical/agitated) exist in `sprite-keys-extended.ts` with zero atlas frames and no draw call. `fx.low_oxygen` is packed in the atlas and never used.
- Thermal, air quality, and crowding surface only through toggled diagnostic overlays — exactly the "twelve diagnostic modes" pattern doc 23 tells us to retire.

### Architecture

- Reusable and strong: the reservation system (the anti-double-booking primitive), the job board (sanitize/repair/cook/haul all fit one pattern), per-tile Float32 field + severity tiers + decal rendering (the sanitation template), `MODULE_DEFINITIONS` as the one data-driven seam, cadence gating for slow ticks.
- Debt: `sim.ts` is 18.6k lines; `updateCrewLogic` (~1,770 lines), `updateResidentLogic`, and `updateVisitorLogic` are monolithic branch trees. Needs are hardcoded scalar fields with scattered consts — no registry, no utility scoring. Every new need touches interface + save + logic + inspectors.
- Three unlock-gating mechanisms coexist: the legacy T0-T6 tier tree (still ticking every frame, UI suppressed), the dormant command-specialty gates, and hardcoded core-loop overrides. Doc 24 Checkpoint 1's "remove from tick path" item is still unchecked.
- Performance guardrails already exist (40k findPath calls/tick budget, path cache, viewport culling); the render decorative layer is cached, so decal work is nearly free per frame.

## The Slice

Ordered so each stage is independently shippable and playtestable. Stages 1-2 are the core; 3-4 follow validation.

### Stage 1 - Surface What Exists (world-first legibility)

Goal: a player who never opens a panel can see dirt, wear, strain, fatigue, and crowding where they occur.

1. **Module condition decals.** Grime/wear/damage overlay on module sprites keyed off `MaintenanceDebt.debt` per `moduleId`, following the floor-grime decal precedent. Amber strain and red fault states for powered machines (the cargo arm already has this pattern — generalize it). New `overlay.module.wear.*` keys in `sprite-spec.yaml`.
2. **Make dirt legible in normal play.** Verify in-browser that dirt actually crosses decal thresholds under realistic traffic; tune accrual/cleaning cadence and decal contrast so a busy shift visibly grimes the cafeteria and corridors before the cleaner arrives. Consider a lower first band (~12) with a subtle decal so "lived-in" reads before "dirty."
3. **Persistent agent state icons.** Generate the missing `overlay.agent.*` atlas art and draw small persistent markers for tired/low-morale crew and angry/critically-unserved visitors (bubbles remain the transient channel; icons are the persistent one).
4. **Low-oxygen haze.** Wire the packed-but-unused `fx.low_oxygen` to `airQualityByTile` in a cached overlay.
5. **Cleaning is theater.** Cleaner crew already walk to dirty tiles; make the act visible (broom badge exists — add a brief sparkle/wipe on completion and let the decal clear tile-by-tile, not room-at-once).

Exit test: pause a mid-shift station and screenshot it. A stranger should be able to point at the dirty room, the strained machine, the tired worker, and the angry queue without any UI open.

### Stage 2 - The Living Crowd (physical needs completion)

Goal: agents use space and time the way Prison Architect inmates do.

1. **Residents use fixtures.** Route resident sleep/hygiene through the existing `ensureCrewUsageTarget` + provider-slot reservation machinery: reserve a specific Bed/Bunk (they already have `bedModuleId`), stand at a specific Shower/Sink, consume a located meal at a table seat instead of decrementing `mealStock`/`waterStock` scalars. This also finally differentiates Bed vs Bunk quality for residents.
2. **Generalize queue theater.** Extract the cafeteria queue chain into a per-provider queue so toilets, bar counters, market stalls, and customs counters form visible ordered lines with balking, instead of invisible reservation contention.
3. **Crew hunger.** Give crew a hunger need satisfied at the cafeteria through the same serving queue as visitors. This creates the classic cross-population contention (feed the crew or serve the passengers) that makes capacity planning real, and it feeds the Labor pressure directly.
4. **Milling and dwell.** Idle/off-duty agents loiter: claim a lounge seat, cluster near other agents (social need pull), wander plaza/corridor idle tiles. Leisure fills a meter over dwell time rather than completing on entry.
5. **Station rhythm.** Add a lightweight station clock with staggered crew shift rosters (on-duty / off-duty / resting thirds over a few minutes) and per-resident routine offsets. The payoff is pulses — a meal rush, a shift change flooding the corridors — which turn capacity from a static ratio into a time-varying problem. This replaces the cosmetic "Day N" string with something real, at whatever period playtests best (likely 3-5 min, not 24 h).
6. **Soft congestion, not hard collision.** Keep tiles stackable (the deadlock lesson stands) but add a visible slowdown + shuffle when local density is high, so a crowded corridor reads and costs time without ever deadlocking.

Exit test: doc 23's own criterion — watch the station for two minutes with UI closed; you should see queues form and drain, off-duty crew in the lounge, a meal rush, and cleaners chasing the mess it leaves.

### Stage 3 - Needs Registry Refactor (do incrementally alongside Stage 2)

Adding crew hunger and resident fixture use by hand-editing three monolithic functions is the last time we should do it that way. Extract, incrementally:

- A data-driven need definition: `{ id, decayPerSec, seekThreshold, criticalThreshold, providerKind, reliefRatesByModule, moraleWeight }`.
- One shared "seek provider -> reserve -> walk -> dwell -> release" behavior template (this already exists in triplicate; unify it).
- Per-population need sets become data. New needs stop requiring surgery on `updateCrewLogic`.

Rule: refactor a behavior only when a Stage 2 item touches it. No big-bang rewrite of `sim.ts`.

### Stage 4 - Prune And Consolidate (after Stages 1-2 playtest)

- Collapse the three unlock gates into one resolver; remove the T0-T6 tick path per doc 24 Checkpoint 1 (`updateUnlockProgress` still runs every tick). Keep earned-automation as the progression spine per doc 23.
- Decide dormant-system fates with playtest evidence: retire or specialize power/water scalars, the 6 unimplemented utility underlay kinds, the reputation/property layer, and the 12-overlay stack (fold the survivors into one Operations View).
- Retire the Progression modal or rebuild it as a mastery/automation ledger.

## Filter

Every item above passes doc 23's five questions the same way: it changes what the player can see and react to during Operate/Diagnose/Intervene, it creates capacity/flow/labor decisions (queues, rushes, fixture counts), two players will furnish and staff differently, and it scales (icons, decals, and queues aggregate naturally; automation handles the rest).

## Explicit Non-Goals

- No new simulation systems (no new utilities, no weather, no new economy).
- No hard tile collision.
- No 24-hour day/night lighting simulation — rhythm first, mood lighting later.
- No resident society/politics expansion; residents get physical, not political.
- No per-frame sprite-sheet animation framework (procedural animation only, per current renderer).

## Code Map (from review)

- Needs + fixture use: `src/sim/sim.ts` (crew ~12626-13110, residents ~16079-16237, visitors ~14290-14744)
- Reservations: `tryCreateReservation` `src/sim/sim.ts` ~11114; `MAX_USERS_PER_USAGE_TILE` ~296
- Queue theater: `buildQueueChain` ~8152, `joinCafeteriaQueue` ~8261, member fix ~14468
- Sanitation loop template: `updateSanitation` ~10967, `createSanitationJobs` ~10816, `dirtByTile` `types.ts` ~2153
- Maintenance debt: `updateMaintenanceDebt` ~7202, `MaintenanceDebt` `types.ts` ~617
- Render decals: decorative layer `src/render/render.ts` ~2559-2595, `pickFloorOverlayKey` ~1281, `drawModuleVisual` ~1369
- Thoughts/bubbles: `render.ts` ~2780-2932, throttle ~4442
- Unused contracts: `sprite-keys-extended.ts` (agent overlays ~53), `fx.low_oxygen` in atlas
- Sprite pipeline: `tools/sprites/sprite-spec.yaml`, `npm run sprites:build:v1`
- Unlock gates to consolidate: `src/sim/sim.ts` ~600-625, `updateUnlockProgress` call ~18548
- Shift/routine hooks: `shiftBucket` ~5150, `updateResidentRoutinePhase` ~14980

Line numbers are approximate against `ad3d267`; verify before editing.
