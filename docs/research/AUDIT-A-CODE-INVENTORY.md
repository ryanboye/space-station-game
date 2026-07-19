# AUDIT A — Complete System Inventory (code autopsy, receipts-backed)

**Target:** `origin/main` @ `171816b` ("compounding district incident memory"), read via detached worktree.
All `sim.ts` line numbers refer to `src/sim/sim.ts` at that commit unless another file is named.
**Relation to prior audits:** builds on `SPACEGAME-DEEP-RX.md` (the dead rating bus), `SPACEGAME-COREloop-SPEC.md` (measured dossier: extinction bug, dock zones, economy sign-flips), `SPACEGAME-DETERMINISM-RX.md` (six frozen variety axes, the wiki-test razor), `SPACEGAME-COLONY-REVIEW.md` (built-systems-without-consequence). Those findings are **cited, not re-derived**; everything new here was read directly from the code this pass.

**Verdict vocabulary** (used per system):
- **SUBSTANTIVE** — changes optimal play; a player who ignores it earns less / loses something they feel.
- **LATENT** — real machinery with real consequences wired in, but unreachable, unpriced, or invisible at normal play scale. (One tuning/surfacing change from substantive.)
- **DECORATIVE** — computes numbers that terminate in a panel, an overlay, the dead rating bus, or nothing.

The single most important structural fact, confirmed unchanged at this commit: **`stationRating` still has exactly four functional consumers, all resident-related** — move-in gate + curve (`sim.ts:5945,5952`), visitor-conversion curve (`:6018`), resident satisfaction signal (`:13842`) — plus UI. Arrivals still read only the slider (`:7918-7924`). Every "quality" system that pays into rating is therefore paying into a meter with no early-game consequence (DEEP-RX's dead bus, verified line-by-line again here).

---

## PART 1 — THE INVENTORY

### Layer D: DEMAND (who shows up)

#### D1. Traffic scheduler
- **Simulates:** ship arrival cadence.
- **Inputs:** the player's Traffic slider ONLY (`controls.shipsPerCycle`, clamped 0-3, `sim.ts:7918-7924`), cycleDuration 15s (`:179`), RNG jitter.
- **Outputs:** calls `scheduleSporadicArrival` (`:8058-8062`). Nothing else in the game modulates cadence — not rating, not reputation, not exits, not tier.
- **Verdict: DECORATIVE as a *system* (a fixed faucet), and the slider itself is a fake dial** — COREloop-SPEC measured visitors/min flat (1.30/1.27/1.20) across slider 1→3 because dock capacity binds, while each queued-then-timed-out ship silently bleeds −1.4 rating (`:8128-8133`). Note the timeout bleed exists **only on the legacy-dock path**; berth-bound traffic (D5) never queues and never pays it (`:7994-8006` returns before the queue code).
- **Receipts:** `sim.ts:180,7918-7924,8043-8066,8128-8133`.

#### D2. System map — factions, planets, belts, lane profiles
- **Simulates:** a procedural star system (3-6 factions from 6 hand-authored templates, 2-6 planets, 1-3 belts), lane sectors with dominant factions.
- **Inputs:** a sub-seed of `seedAtCreation` (`system-map.ts:48-60`) — which is the hardcoded 1337 (`initial-state.ts:62`, bare call `main.ts:852`), so **every player gets the same galaxy**.
- **Outputs:** faction `shipBias` → per-lane ship-type weights (`generateLaneProfiles`, `sim.ts:475-514`) → which ship *type* spawns per lane (`:7978-7992`). That is the entire gameplay output of factions, planets and belts. Planets/belts feed only the system-map modal.
- **Verdict: DECORATIVE.** It shifts the archetype mix a few percent between lanes of a station whose lanes the player has no reason to distinguish. No contracts, no faction standing, no events, no prices.
- **Receipts:** `system-map.ts:1-90`, `sim.ts:475-537`, `initial-state.ts:62`.

#### D3. Ships & manifests
- **Simulates:** 5 ship types with service expectations, per-ship demand profile (cafeteria/market/lounge split) and archetype mix (`generateShipManifest`, `sim.ts:3548-3653`; profiles `content/ships.ts:3-47`).
- **Inputs:** ship type, RNG, unlock tier (locked services zeroed `:3596-3602`).
- **Outputs:** (a) which archetypes spawn (`:5130-5138`); (b) a rating penalty on departure if the station lacks the ship's tagged services, 0.25×weight (`:8165-8169`), military extra penalty for open incidents / low coverage (`:8170-8177`); (c) conversion-chance multiplier (colonist 2.1×, `ships.ts:44`). The HUD shows demand shares (`:14654-14656`).
- **Verdict: LATENT.** This is a real "who is this customer" system — but its only teeth are rating ticks (dead bus) and a conversion multiplier (T4 content). A trader ship full of shoppers vs a colonist ship full of loungers produces no decision the player can even see, because ships are never offered, only delivered.
- **Receipts:** `sim.ts:3548-3653,8165-8177`, `content/ships.ts`.

#### D4. Legacy docks & dock queue
- **Simulates:** Dock-tile clusters as one-ship berths ("zones"), approach lanes, a queue with 18s timeout.
- **Inputs:** player-painted Dock tiles (10 materials each, `:257`), per-dock allowlists (type/size/purpose — a full config modal, `dock-controls.ts:39-97`).
- **Outputs:** ships dock → spawn **1-2 passengers** per pod (`:276-277,8236`); queue timeout → the silent −1.4 bleed. Dock *zones* are the real demand multiplier (COREloop-SPEC: 1→4 zones = 1.30→3.50 vis/min) but nothing in the UI ever says so.
- **Verdict: SUBSTANTIVE but mislabeled** — the one lever that genuinely scales demand is presented as wall-paint while the fake slider gets the panel. (SPEC CH-4 stands.)
- **Receipts:** `sim.ts:5348-5421,8008-8040,8224-8274`, `dock-controls.ts`.

#### D5. Berths (dock-migration v0) — capability modules, size classes, screening, customs
- **Simulates:** Berth *rooms* ships dock inside; Gangway/CustomsCounter/CargoArm modules grant capability tags; ship types require tag sets (tourist=gangway … military=all three, `ships.ts:10-45`); size classes S/M/L by area (4/20/42 tiles, `balance.ts:432-438`); per-berth allowlists + screening level + customs policy (`types.ts:1083-1089`).
- **Inputs:** player room-paint + module placement + config modal (`main.ts:6490-6496`).
- **Outputs:** This is quietly the **biggest lever in the game**: berths are tried FIRST for every arrival (`sim.ts:7994-8006`), and berth ships carry **6/18/34 passengers** (small/medium/large ±jitter, `:271-275,3420-3422`) versus the legacy pod's 1-2 — a ×17 demand multiplier for painting a bigger room; with any berth present, ALL unlocked ship types join the candidate pool (`:7965-7972`). Screening/customs feed the reputation zone math (control/notoriety/value, `:3117-3141`) → theft pressure (O3). Missed matches surface a capability hint (`:8014-8025`) with **no penalty**.
- **Verdict: SUBSTANTIVE — and it is the closest thing in the codebase to DETERMINISM-RX's P1 "docking draft," minus the draft.** All the offer *content* exists (type, size, capability requirement, risk posture via customs); what's missing is that acceptance is automatic and invisible, so the player never faces the offer.
- **Receipts:** `sim.ts:271-275,3420-3426,5422-5615,7994-8006`, `balance.ts:138-158,432-438`.

### Layer S: SERVICE & MONEY (the wallet)

#### S1. Visitors — archetypes, patience, multi-leg itineraries
- **Simulates:** 4 archetypes (fixed constants: spendMult 1.32/1.12/0.86/0.78, patienceMult, taxSensitivity, `sim.ts:3437-3462`), a planned 0-3-leg leisure itinerary rolled at spawn (`:5180-5204`), patience accumulation → storm-off at 30 (`:12736-12742`), full service state machine (`updateVisitorLogic`, `:12310-12785`).
- **Inputs:** ship manifests, room/module availability, queue pressure, tax, air, incidents.
- **Outputs:** ALL of the visitor economy (S2-S4), the rating micro-ticks, conversion candidates.
- **Verdict: SUBSTANTIVE — the load-bearing spine.** But note the failure pricing: a storm-off is a 0.05 rating tick (`:12741`) and the sale it cancels is never shown; bail-while-queueing is 0.012-0.014 *per second* (`:12444,12454`). SPEC B3 (priced, visible refusal) remains unbuilt.
- **Receipts:** above.

#### S2. Food chain (hydro → raw → cook → serve → eat → payout)
- **Simulates:** grow stations produce rawMeal (needs 0.02 rawMaterial each else ×0.7, `:14123-14126`), haul jobs move it, stoves cook (0.95/s/stove, `balance.ts:447-448`), serving stations stock, visitors reserve+carry+sit+eat, **payout only lands at the exit door**: `(3 + tax·8)·spendMult·taxPenalty` (`:12264-12268`, paid `:12717-12722`).
- **Inputs:** rooms/modules, crew haulers/cooks, power ratio, supplies.
- **Outputs:** credits (the exit payout), `servedMeal` flag (drives conversion comfort ×1.2, `:6019`), rating +0.08/meal (`:12493`), dirt.
- **Verdict: SUBSTANTIVE — but 20× overprovisioned** (SPEC Finding: 1 stove ≈ 20× starter demand; withdraw-the-nerf finding 4 also stands: the binding stage is the serving buffer, not the stove). One quiet fallback worth knowing: with **zero crew** the kitchen auto-cooks (`:14137-14146`) — the food chain half-runs on a corpse station.
- **Receipts:** `balance.ts:446-453`, `sim.ts:12264-12268,12428-12505,14112-14152`.

#### S3. Trade-goods chain (workshop → market)
- **Simulates:** workbenches turn rawMaterial into tradeGood (0.4/s, 0.85 mat each, capped by market target stock, `:14154-14168`), haulers deliver to stalls, visitors at stalls consume 0.32/s and their market spend multiplies ×(1+goods·0.9) vs ×0.26 on stockout (`:12644-12669`).
- **Inputs:** materials (imported for credits — see M4), crew, market visitors.
- **Outputs:** credits; T3 unlock counter (`tradeCyclesCompletedLifetime += delivered`, `:11745`); stockout → patience + tiny rating tick.
- **Verdict: SUBSTANTIVE.** One of only two chains where placement/logistics genuinely modulate income (goods present vs stockout ≈ ×4 spend). Buried, but real.
- **Receipts:** above.

#### S4. Leisure-venue economy (cantina / vending / market / observatory / lounge / rec / hygiene)
- **Simulates:** per-second spend drips while a visitor stands in Leisure state.
- **Inputs:** room/module presence; visitor legs.
- **Outputs:** **Cantina: 0.85 cr/s ×(1+0.18/Tap)×spendMult** for any leisure visitor anywhere in the room (`:12621-12638`) — *no stock, no staffing, no serving interaction*: `consumeCantinaSupplies` (`:8575-8581`) and `CANTINA_UNSTOCKED_SERVICE_MULTIPLIER` (`:382`) are **defined and never called** — the supply chain for drinks is dead code. Vending: 0.42/s (`:12612-12617`). Market: S3. Observatory/lounge/rec/hygiene: **no credits at all** — only rating ticks 0.02-0.07 (`:12566-12577`) and dwell.
- **Verdict: the cantina is SUBSTANTIVE in the worst way — it's the game's best faucet and asks nothing.** Highest per-second revenue in the sim, unconditional, stacking with multi-leg itineraries. Observatory (a T3 "premium" room with a 2×2 telescope) earns literally zero credits — pure rating, i.e. DECORATIVE.
- **Receipts:** `sim.ts:382,8575-8581,12566-12677`.

#### S5. Tax slider
- **Simulates:** a revenue-vs-satisfaction dial: raises meal payout (+8/unit tax) while shrinking patience (`:12000-12004`) and applying spend penalties (`:12260,12265`).
- **Verdict: DECORATIVE as a decision** — measured monotone one-way under both payout formulas (SPEC CH-5: one right answer per formula; the counter-pressure can't bind while bails ≈ 0). Unchanged at this commit.
- **Receipts:** `sim.ts:12000-12004,12259-12268`.

#### S6. Clinic & actor health
- **Simulates:** low-air exposure → distressed/critical → death at 62s (`:4970-5006`, thresholds `:292-296`); clinic tiles heal 2.4 exposure-sec/s (`balance.ts:452`; applied `:12326-12327,13796-13800`); sick visitors self-route to MedBeds.
- **Inputs:** per-tile air; **and a tier-gated script**: `maybeCreateTier3Patient` (`:4148-4169`) *injects* a sick visitor at 0.18/s probability while the T4 milestone counter is unmet (then drops to 0.0025/s). Its sibling `maybeCreateTier3DispatchIncident` (`:4171-4204`) does the same for incidents at 0.16/s.
- **Outputs:** `actorsTreatedLifetime` → T4 unlock; otherwise deaths/bodies.
- **Verdict: LATENT machinery + DECORATIVE theater.** The healing loop is real, but its steady-state demand is manufactured by the milestone script — the game literally poisons a customer so you can pass the tier exam, then almost never again. No treatment fee, no outcome the wallet sees.
- **Receipts:** above.

#### S7. Station rating (the bus)
- **Simulates:** 70 + Σ(bonus−penalty) clamped 0-100 (`:14636`); ~14 penalty buckets and 4 bonus buckets with full attribution telemetry (`:15040-15108`).
- **Inputs:** everything — walk distance, route exposure, environment, sanitation, bails, timeouts, trespass, fights, thefts, meals, leisure, exits, resident retention.
- **Outputs:** resident move-in gate/curve and satisfaction (`:5945,5952,6018,13842`). Nothing else. Arrivals: no. Spend: no. **Also rigged:** the −1.4/timeout structural bleed (D1) zeroes every dock-based station (SPEC Finding 2, bit-identical no-op proof in Finding 1).
- **Verdict: DECORATIVE until T4 — the dead bus, unchanged.**

### Layer P: POPULATION (who does the work)

#### P1. Crew agents + needs (energy / hygiene / bladder / thirst)
- **Simulates:** four decaying needs with self-care trips (rest shifts with a 35% cap + emergency wake budget, toilet, drink at cantina/fountain, shower, leisure) — ~1,000 lines (`updateCrewLogic`, `:10856-11854`).
- **Inputs:** time, work, crowd exposure (`:10881-10883`), air emergencies.
- **Outputs:** (a) movement-speed penalty 0.78×/0.58× at low energy/hygiene (`:10869-10875`); (b) time off-duty; (c) morale inputs (P6); (d) hygiene-stress term in ambient incident rate (`:14243-14248`).
- **Verdict: mostly DECORATIVE.** The consequences are a soft speed penalty and a morale number nobody consumes (P6). Crew never quit, never demand raises, have no traits, no skills, and payroll is 0.32/crew/30s (`:278-279`) — DETERMINISM-RX's "fungible integers" verdict stands. The simulation *depth* here (bladder timers!) is wildly out of proportion to its gameplay *width* (≈nothing).
- **Receipts:** above.

#### P2. Job board / logistics (transport, cook, repair, extinguish, sanitize, construct) + reservations
- **Simulates:** a full job economy — item nodes with capacities, TTLs, stall/requeue reasons, batch metrics, a reservation ledger with 6 kinds, work-lane targeting (`:8475-10533`), provider summaries.
- **Inputs:** stock deltas, debts, dirt, fires, construction sites; crew availability.
- **Outputs:** the actual movement of goods → S2/S3 income; repair/extinguish/sanitize responses.
- **Verdict: SUBSTANTIVE (infrastructure).** This is the game's best engineering, and it works (SPEC: hauls never stall with living crew). Its only sin is that most of what it hauls *for* (repairs, sanitation) has decorative consequences.

#### P3. Crew priorities panel (presets + 10 weights)
- **Simulates:** per-system assignment weights (`:3464-3513`).
- **Verdict: DECORATIVE at best, broken at worst** — SPEC bug ticket #1: `--preset food-chain` was **bit-identical** to default in the 16-crew stall repro. Unfixed at this commit.

#### P4. Command layer — 24 staff roles, officers, 8 specialties, departments, 19 bridge-terminal types
- **Simulates:** a research tree (select specialty → progress → complete → officer hireable → department "active" when officer + bridge terminal staffed, `:9944-10016,16013-16167`; content `content/command.ts`), 19 distinct 2×2 bridge terminal modules (`balance.ts:23-43`).
- **Outputs — exhaustively:** `departments.security.active` gates access-gate staffing (`:3034-3040`) and posture control bonus (`:3158`); `departments.mechanical.active` adds +18 repair-job priority (`:8600`) and improves EVA repair-route multiplier 0.48→0.82 (`:11685`). **That is every functional consumer.** Sanitation, industrial, navigation, comms, medical, logistics, research departments: zero sim effects. The terminals exist to be staffed so the department reads "active" so… mostly nothing.
- **Verdict: DECORATIVE — the single most expensive decorative surface in the game** (hundreds of lines, 19 module sprites, a full progression UI, four consumer call-sites). SPEC's cut-list already sentenced the "bridge terminal zoo"; this pass confirms the sentence with the consumer census.
- **Receipts:** above.

#### P5. Residents — needs, stress/agitation/satisfaction/leave-intent, routine phases, civic roles
- **Simulates:** 6 needs/moods (hunger/energy/hygiene/social/safety/stress), a 120s routine day (rest/errands/work/socialize/winddown, `:334,12814+`), agitation → confrontations (O2), satisfaction ← needs + rating + stress (`:13840-13854`), leave-intent accumulation (`:13855-13859`), volunteer roles that buff market (+ up to 45% spend), hydro (+ up to 40%), security suppression (`content/residents.ts`, consumers `:12248-12257,14102-14103,14245-14247`).
- **Outputs:** taxes (P7), confrontation/fight supply, retention rating drip (+0.0009/s, `:14064-14068`), role buffs.
- **The scandal: residents can never leave.** `RESIDENT_DEPARTURE_RATING_PENALTY` is declared (`:311`), `ratingFromResidentDeparture` appears in the drivers UI (`:15061`), `residentDepartures` counters exist — but **no code path ever removes a dissatisfied resident**; `ResidentState.ToHomeShip` immediately resets to Idle (`:13916-13922`). `leaveIntent`'s only real consumers: blocks confrontations (`:13045`) and exempts from taxes (`:14294`). The eviction threat that the whole satisfaction machine points at is a stub.
- **Verdict: LATENT.** A rich mood simulation whose only exits are a tax multiplier and fights.

#### P6. Morale
- **Simulates:** 100 − crew fatigue − crew hygiene − air − power − payroll penalties (`:14518-14527`).
- **Outputs:** ONE consumer: a crew-leisure-seeking gate (`:11078`). Confirmed unchanged since DEEP-RX.
- **Verdict: DECORATIVE.** A headline HUD stat with zero consequence.

#### P7. Resident conversion, housing, taxes
- **Simulates:** move-in attempts every 20s (needs residential dock + private bed with hygiene path + **rating ≥ 50**, chance 0.14-0.94, `:5933-5981`); exit-door conversion of visitors (base 3% × ratingFactor × comfort × shipType × housing-zone reputation, `:6000-6059`); home ships occupy residential docks; taxes 0.42/head/24s × satisfaction multiplier 0.45-1.35 (`:14289-14301`).
- **Verdict: SUBSTANTIVE at T4+, unreachable before** — it is the sole consumer of the rating bus, hours away from the complaint window. The reputation-zone housing multiplier (`:3303-3307`) is a nice hidden placement incentive… feeding a T4 mechanic.

### Layer V: SURVIVAL (what can kill you)

#### V1. Pressurization + airlocks
- **Simulates:** flood-fill vacuum from Space through non-barrier tiles (`computePressurization`, `:3969-4077`); leaking tiles drain global air (`:14100,14221-14223`); depressurized tiles → local air 5 (`:4738-4739`).
- **Verdict: SUBSTANTIVE** (build validation + the air floor), though breaches only occur from player edits — nothing (not even "meteors", V5) ever makes a hole.

#### V2. Life support & air (global + per-tile), vents, air ducts
- **Simulates:** global air = supply(active LS tiles × 0.258/s × power × maintenance + passive) − demand(pop) (`:14206-14223`); per-tile air shaped by LS-coverage distance bands 100→28 (`:4715-4767`); Vent modules as secondary sources within 16 tiles of LS, optionally requiring a powered air-duct network (`:1909-1960`); exposure → distress → death (S6).
- **Verdict: SUBSTANTIVE — the game's one real killer.** But binary in feel: self-heals or exterminates (SPEC CH-0: the starter has **no LS room** — `initial-state.ts` paints hull/reactor/bridge only — and hiring past ~4 crew is lethal by minute 4, the silent-extinction P0, still unfixed at this commit). No middle band: air 40-99 changes nothing about spend, speed, or service (DEEP-RX FIX 2 unbuilt).

#### V3. Thermal (heat / stale air)
- **Simulates:** per-tile heat from sunlight (map condition) − insulation/vents/LS-coverage/thermal-sink + module & room loads + fires + debt + occupancy (`updateThermalDrift`, `:4909-4967`), full diagnostic pipeline.
- **Outputs — traced:** (a) `usageTotals.thermalPenalty` (0.00018/hot-tile/s) → **metrics mirror only** (`:14923-14924`); it never touches `ratingDelta` — the thermal "penalty" doesn't even reach the dead bus; (b) heat > 72 raises module/system maintenance debt (`:6925,7016-7017`) — itself mostly inert (V4); (c) heat/staleAir fold into room-environment scoring (`:4300-4301`) → ±rating micro-ticks and resident stress.
- **Verdict: DECORATIVE.** A three-source, two-field, cadenced thermal simulation whose strongest consumer is a maintenance meter that itself changes almost nothing. Textbook "hidden rule computes a number, number drifts a meter, panel explains it" (SPEC Part A).

#### V4. Maintenance (system / module / exterior / dock / berth debts, repairs, EVA)
- **Simulates:** debts rising per-minute on reactor/LS (0.6-0.8), modules (0.06 idle + 0.72 load), hull/dock/berth exteriors (idle 0.08 + debris ×1.75 + traffic ×0.34) (`:213-222,6931-7059`); staffed repair 4.5/min; repair jobs at threshold; repair parts consumption (2 rawMaterial else ×0.5 speed, `:249-250`); EVA suits with 240s oxygen for exterior work (`construction.ts:50-83`).
- **Outputs — the census:** debt → output multiplier (1.0→0.4) consumed **only** by LS air (`:14212`) and reactor power (`:14442-14443`). The module/dock/berth/hull debts — whose UI strings promise *"meal prep slowed at high wear," "ship service slowed at high wear"* (`:1701-1706,6886-6893`) — have **no output consumer anywhere**. They feed: thermal load (V3), a reputation prestige penalty (`:3092-3094,3149`), repair-job busywork, and fire ignition (V6) — which only checks reactor/LS debts anyway (`:7038` sits inside `processSystem`).
- **Verdict: LATENT for reactor/LS; DECORATIVE for everything else — and the inspector strings are legibility lies** (the game's best asset, per COLONY-REVIEW, quietly undermined: the panel promises consequences the sim never applies).

#### V5. Debris / "meteor damage" + map conditions (sunlight, debris-risk, thermal-sink)
- **Simulates:** three seeded low-frequency scalar fields over the grid (`map-conditions.ts:43-78`); debris-risk scales exterior debt rise; "impacts" = a deterministic sine trigger that stamps `lastImpactAt` (`:6764-6777`).
- **Outputs:** `lastImpactAt`'s sole consumer is a render flash (`render.ts:587`). Debris never breaches hull, never depressurizes, never destroys a module, never costs credits. Sunlight/thermal-sink feed V3 (decorative). Map-condition *placement variety* is also seed-frozen (D2).
- **Verdict: DECORATIVE.** "Meteor damage" is a light show plus a slow drip into an inert debt meter.

#### V6. Fire
- **Simulates:** ignition when a reactor/LS debt sits ≥92 for 18s (`:7038-7047`, consts `:8965-8977`); growth 4.5/s, spread ≥55, tiles block ≥30, **modules destroyed at ≥80** (`:9247-9254`); local air crushed to 18 (`:4761`); extinguisher modules (radius 6) + crew extinguish jobs; burnout refunds 50 debt (`:9230-9236`).
- **Verdict: LATENT — real teeth, unreachable trigger.** With idle debt rise 0.16/min vs staffed repair 4.5/min, reaching 92 requires the crew to be dead or absent for ~10 hours — i.e., fire is a post-extinction symptom, not a live threat. The one system that destroys player property is gated behind a threshold normal play can't cross.

#### V7. Sanitation
- **Simulates:** per-tile dirt from traffic/meals/kitchen/market/fires/bodies (`:9286-9327`), severity bands, cleaning jobs with patch radius, source attribution.
- **Outputs:** rating micro-ticks capped 0.18/visit (`:12024-2032` — the 0.0014/s constant `:241`), resident stress, reputation dirtPenalty (`:3148`), cleaning busywork.
- **Verdict: DECORATIVE** (SPEC RX5's "give one entropy channel teeth" was never built: filth still slows nothing and costs no sale).

#### V8. Power
- **Simulates:** supply 14 + 22/reactor × maintenance vs demand 9 + per-room + per-actor (`:14442-14461`); `powerRatio` multiplies hydro/kitchen/workshop/water/LS-air (`:14101-14214`); deficit → incidentHeat drip, morale penalty, brownout flavor in the failure director (`:14252-14254,14525,14329`); brownout effect = actor speed ×0.65 for ~4s (`:8365`).
- **Verdict: LATENT.** The plumbing is genuinely load-bearing (powerRatio multiplies everything) but supply steps are so large a reactor covers ~15 rooms (SPEC), so the constraint never binds — a dial that would matter at one-third the wattage.

#### V9. Utility underlay (7 layers)
- **Simulates:** paintable sub-floor networks: air-duct, hot-pipe, cold-pipe, power-conduit, coolant-pipe, water-pipe, data-conduit (`types.ts:76-83`), with full network discovery/diagnostics (`utility-underlay.ts:215-330`).
- **Outputs:** **only `air-duct` has a sim consumer** (vent powering for LS coverage + thermal relief, `sim.ts:1931-1960,4860-4864`). The other six kinds: paint + overlay, no effect.
- **Verdict: DECORATIVE ×6, SUBSTANTIVE-adjacent ×1.** An entire infrastructure-painting minigame where 86% of the palette is inert.

### Layer O: ORDER (crime & consequence)

#### O1. Security aura, cameras, gates, posture
- **Simulates:** aura radius 9 from stationed security crew (`:4465-4497`), camera/gate module coverage (radius 7), 3-way posture profile (discreet/standard/visible with real tradeoff shapes — prestige vs control, `:2990-3032`).
- **Outputs:** suppression of trespass spawn (`:12357-12374`), confrontation chance (`:13084-13094`), resident safety recovery (`:13809-13827`), reputation control/visibleForce (O4).
- **Verdict: SUBSTANTIVE within the crime loop** — the loop's overall stakes are what's thin (O2/O3). Note the posture select is one of the few real *tradeoffs* in the game (visible force cools crime but bleeds prestige in lounge/dorm/observatory zones, `:3175`).

#### O2. Incident pipeline (trespass / fight / theft → dispatch → intervene → escort → brig → eject)
- **Simulates:** a genuine 9-stage pipeline with response-time-as-distance, congestion penalties, brig containment (×0.76 intervention, `:13624`), holding cells, ejection escorts, fight escalation (extended brawls, `:13170-13190`), outcomes incl. **fatality** (failed fight kills the highest-stress resident, `:13549-13559`).
- **Inputs:** resident agitation (P5), theft generator (O3), trespass on restricted zones, tier-3 milestone script (S6), ambient rate from crowd+hygiene (`:14241-14251`).
- **Outputs:** **theft failure costs real credits (4-120, `:13573-13576`)**; theft resolution recovers 12% ≤18 (`:13528-13532`); fight failure = death + 0.3×sev rating; incidentHeat feeds the load meter; every incident stamps district memory (O3).
- **Verdict: SUBSTANTIVE — the newest and best-wired consequence chain in the game** (landed in `d8f73fd`/`171816b`). Its weaknesses: magnitudes (a failed theft ≈ 1-2 minutes of one cantina visitor) and the fact that most of it renders as list rows, not scenes (SPEC B4 unbuilt).

#### O3. Theft generator + district incident memory
- **Simulates:** thefts spawn in reputation zones with crimePressure ≥36 (chance Σ(crime−30)·0.0005/s, `:13117-13168`); each incident stamps a 75s-half-life memory on its district anchor (`:2876-2946`) which feeds back into notoriety (+0.6×heat, `:3188`) and crimePressure (+0.5×heat, `:3222`) → more theft.
- **Verdict: SUBSTANTIVE — the only closed feedback loop in the game outside the food chain**, and the first "story beat" (a pocket of the station going bad and staying bad). Correctly identified in the commit message as the start of Pass-2 wiring. Its input, though, is mostly *static room bases + traffic* — the player's main lever is camera/gate/guard placement, which works (control −0.62 coefficient) but is never asked for by anything the player is watching.

#### O4. Reputation zones (prestige / notoriety / control / value / opacity / crimePressure / labels)
- **Simulates:** a 180-line, 8-label scoring pass per room cluster (`reputationScoreForCluster`, `:3081-3260`) blending 20+ signals: room bases, environment, dirt, air, security, cameras, gates, posture, customs, screening, traffic, incident heat, district memory, module counts, zone privacy.
- **Outputs — the census:** (a) spend multiplier 0.82-1.36 consumed **only** in `marketSpendPerSec` (`:3297-3301,12261`) — not meals, not cantina, not vending; (b) housing-conversion multiplier (T4, `:3303-3307`); (c) theft targeting/pressure (O3); (d) `reputationPremiumDemandBonusPct`/`RiskyDemandBonusPct` — **computed (`:14626-14627`) and consumed by nothing** — the demand hook exists as a stub metric; (e) overlay/inspector.
- **Verdict: LATENT.** A genuinely sophisticated district simulator whose outbound wires are one market multiplier, a T4 multiplier, and theft — while its purpose-built "demand bonus" outputs dangle unconnected. This is the dead-bus pattern repeated one layer down.

#### O5. Load/capacity + failure director
- **Simulates:** load (pop + power + heat×5 + needs + health) vs capacity (30 + per-room), ratio ≥0.9 → random micro-failures: 3s cafeteria stall, 3s corridor block, 5s security delay, 4s brownout (`:14303-14335,14489-14516`).
- **Verdict: DECORATIVE** — the effects are 3-5 second invisible debuffs with no announcement (COREloop-RX's "109 incidents, zero drama" includes this). It is the closest thing to a director and it directs nothing you can see.

### Layer M: META (progression & construction)

#### M1. Unlock tiers (0-6)
- **Simulates:** monotonic lifetime-counter predicates (T1 first visitor; T2 500cr + 3 archetypes; T3 one trade cycle; T4 one patient + one incident resolved; T5 5 residents/5 beds/1 residential berth; T6 stub `false`) gating rooms/modules/ship types (`content/unlocks.ts:27-219`).
- **Verdict: SUBSTANTIVE as pacing, DECORATIVE as decision** — one linear ladder, no choices (DETERMINISM-RX P5 unbuilt); and T4's requirements are satisfied by the milestone-injection scripts (S6) — the game grades its own exam.

#### M2. Expansion (map purchase)
- **Simulates:** buy +40 tiles per cardinal direction, 2000/4000/6000/8000cr (`expansion.ts:36-59`, `sim.ts:407-408`).
- **Verdict: SUBSTANTIVE as the only meaningful credit sink; but with income uncapped and space non-binding at starter scale, it's a timer, not a choice.**

#### M3. Construction (blueprints, build jobs, EVA)
- **Simulates:** material delivery + build work per site, EVA-required exterior work with 240s suit oxygen (`construction.ts`), truss expansion.
- **Verdict: SUBSTANTIVE (infrastructure).** Costs are real (credits + materials + labor). Never *forced* though — nothing ever breaks a built thing except unreachable fire.

#### M4. Materials market + auto-import
- **Simulates:** import at 0.72/unit × dynamic multiplier (0.8-1.35, load + sine pulse, `:15784-15788`), batch auto-import to logistics stock (default on, `:15895-15938`), manual buy/sell buttons (sell: `:16204-16235`).
- **Verdict: SUBSTANTIVE (it's the input side of S3/V4 repairs) — but the "price dynamics" are a sine wave, and the auto-importer spends silently (SPEC bug #3, still true: status string only).**

#### M5. Environment traits / route exposure / route pressure
- **Simulates:** per-room aesthetic traits (`balance.ts:242-264`) sampled radius 5 (`:4264-4323`); per-trip route exposure scoring (`:4213-4262`); route-pressure overlay (`:2739+`).
- **Outputs:** rating micro-ticks capped 0.24-0.28/trip (`:12006-12033`), resident stress, market spend ±15% (`:12658-12664`), reputation inputs.
- **Verdict: DECORATIVE** — SPEC measured the whole family at ±3% and cut-listed it; unchanged.

#### (Excluded as non-gameplay: save/load, scenarios/cold-start loaders, sprite/render pipeline, path cache & perf plumbing — all solid engineering, no design content.)

---

## PART 2 — SYNTHESIS

### A. WHAT THE SIM ACTUALLY REWARDS

**Every credit inflow, exhaustively** (there are exactly seven):
1. Meal exit payout — `(3+8t)·mult` per served visitor who reaches the door (`:12717-12722`).
2. Cantina drip — 0.85/s per leisure visitor in the room, unconditional (`:12635`).
3. Vending drip — 0.42/s (`:12613`).
4. Market drip — 0.45/s × up to ~1.3 goods multiplier × reputation 0.82-1.36 (`:12665`).
5. Resident taxes — ~1cr/min/resident (`:14296`).
6. Theft recovery — 12% of stolen value, ≤18 (`:13529`).
7. Manual sell buttons (materials/food).

**Every outflow:** payroll 0.64/min/crew (`:279`), build costs (tiles 0-10cr), module costs, material imports (~0.72/unit), hires (14), expansion (2000+), theft losses (≤120), body clearing (6/4 bodies, `:300`). At 8 crew, total *recurring* cost ≈ 5cr/min — one cantina visitor covers it.

**Therefore the optimal build, readable straight off the constants:**
- Max the traffic slider (free, no downside on a berth station).
- Paint **one large Berth (≥42 tiles) + Gangway + CustomsCounter + CargoArm** → every ship type eligible, 6-34 passengers/arrival instead of 1-2 (`:271-275,7994-8006`), and — because berth traffic never enters the dock queue — **zero exposure to the −1.4 timeout bleed** that zeroes dock stations.
- Cafeteria+kitchen+hydro (one of each — 20× overcapacity) to flip `servedMeal` for the exit payout and conversion bonus.
- A **Cantina with 2-3 Taps** on the berth→cafeteria path: the best per-second faucet in the game, needing no stock (dead supply code, `:8575` uncalled), no staff, no layout finesse.
- Ignore security, hygiene, sanitation, thermal, insulation, utilities, command, observatory, clinic: their absence costs rating (dead), stress (residents can't leave, P5), or losses smaller than one minute of cantina revenue.

Where does the argmax come from? Not from one bad constant but from a **structural asymmetry: income paths are per-second drips and per-head payouts with no capacity, quality, or risk gate that binds; loss paths either terminate in `stationRating` (no consumer), in `morale` (one consumer, cosmetic), in `metrics.*` (telemetry), or in magnitudes an order below the faucets.** The owner's phrase "hit play and amass credits" is literally the cantina/berth loop: bodies arrive in pulses, stand in rooms, and emit credits per second; nothing that goes wrong can reach the number going up. This *sharpens* DEEP-RX: it's not only that quality signals route to a dead bus — it's that the healthy half of the economy was built with no live wire *into* it either.

And per DETERMINISM-RX, even if the loss paths were live, all six variety axes are still frozen (seed 1337 galaxy included — `initial-state.ts:62`), so the answer above is the answer *every* run.

### B. SYSTEM → GENRE ANALOG MAP

| ours | closest analog | the gap vs the analog |
|---|---|---|
| Air / life support / vents-ducts | **ONI** oxygen + gas piping | ONI's air is a continuous economy you route; ours is fine-or-extinction with one live pipe kind of seven |
| Thermal (heat/stale, insulation, sunlight) | **ONI** heat | ONI heat breaks machines & crops; ours decorates a panel and nudges an inert debt |
| Visitors / patience / queues / storm-offs | **Two Point Hospital** patients | TPH queues are visible bodies and lost fees; our bails are 0.012 ticks on a dead meter |
| Berths + capabilities + screening/customs | **Startopia** docks / **Airport CEO** gates & stands | Those make each arrival an *accepted contract*; ours auto-accepts invisibly |
| Reputation zones / district memory / theft | **Prison Architect** danger + **RimWorld** raid points, or **Startopia**'s seedy decks | PA's danger changes what you must *do today*; our crimePressure changes a label and a rare 4-120cr event |
| Incident pipeline (dispatch→brig→eject) | **Prison Architect** guards/solitary/escort | PA stages it as watched scenes; ours resolves in list rows |
| Crew + needs + priorities | **RimWorld** pawns + work tab | pawns are trait bundles that force adaptation; our crew are interchangeable bladders; the work tab (priorities) is measured inert |
| Command / specialties / departments | **Evil Genius** henchmen / X4 crew chain | those unlock felt capabilities; ours unlocks terminals that unlock nothing |
| Residents / satisfaction / taxes | **SimCity/Tropico** citizens | those *leave* and their leaving is the game; ours are structurally incapable of leaving |
| Maintenance debts + EVA repair | **FTL** hull / **Startopia** wear | there, disrepair stops the thing; here, only reactor/LS multipliers exist and the rest is caption fiction |
| Fire | **RimWorld/ONI** fire | theirs starts from live causes; ours needs debt 92 — i.e. a dead crew — to ever start |
| Meteor/debris | **RimWorld** drop-pod raids / ONI meteor showers | theirs puncture the roof you built; ours flashes a sprite |
| Failure director (stalls/brownouts) | **RimWorld storyteller** (vestigial) | Cassandra announces and escalates; ours rolls invisible 3-second debuffs |
| Unlock tiers | **PA** grants / tycoon campaign gates | linear here, choiceless; and T4's proof-events are self-injected |
| System map / factions | **X4 / Elite** background sim | theirs bleeds into prices/missions; ours re-weights a spawn table a few % |

### C. THE WIRING GAP — islands, load-bearers, and the cheapest missing edges

**The load-bearing core (the game that exists):** Berths/docks → ships → visitors → food + market + drips → credits; crew/jobs hauling underneath it; air as the one mortal constraint; expansion as the one sink. Everything on this path works and differentiates play (SPEC Finding 3: 10× profit spread between lazy and optimized stations once crew live).

**The islands (real machinery, no live edge to anything felt):**
- **Rating** — 14 penalty buckets → 4 T4-only consumers. *The* island; every other island drains into it, which is why they're islands.
- **Command/departments** — 4 consumer sites for an entire progression layer.
- **Thermal** — its "penalty" doesn't even reach the dead bus (`:4967` → metrics only).
- **Module/hull/dock maintenance** — UI promises throughput loss; no consumer exists.
- **Morale** — one cosmetic consumer.
- **Resident satisfaction/leave-intent** — a departure system with no departure.
- **Utility underlay** — 6 of 7 layers inert.
- **Reputation demand bonuses** — computed, never read (`:14626-14627`): someone built the jack, nobody plugged in the cable.
- **System map/factions, observatory, meteor flashes, tax slider, priorities panel** — per above.

A pattern worth naming for the rewrite: **the codebase repeatedly builds the *sensor* and the *display* but not the *actuator*.** Sensors: thermal fields, debt meters, reputation scores, satisfaction, morale. Displays: overlays, inspectors, driver strings (world-class, per COLONY-REVIEW). Actuators — the part where the number reaches traffic, money, speed, or destruction — exist only for air, theft, and the food/market chain. Several actuator stubs are literally sitting there half-soldered: `reputationPremiumDemandBonusPct` (no reader), `ratingFromResidentDeparture` (no writer), `consumeCantinaSupplies` (no caller), "slowed at high wear" (no effect).

**The missing edges, ranked by (consequence felt) ÷ (new content needed):**

1. **Rating → arrival rate** (DEEP-RX FIX 0 / SPEC CH-2, with CH-0/CH-1 prerequisites). One line at `:7921` plus the measured bonus retune. Turns every island that drains into rating into an indirect traffic wire. Still the keystone; nothing in `171816b` changed it.
2. **Berths → offers.** The draft mechanic (DETERMINISM-RX P1) is ~80% built as data (D5): types, sizes, capability requirements, screening/customs risk posture, 6-34-passenger stakes. Missing: a hail queue + accept/decline UI + seeded offer generation. This is the cheapest path to a minute-to-minute decision because *the consequence rendering already exists* — the crowd arrives and crashes on your rooms.
3. **Reputation → demand mix.** The outputs are already computed (`:14626-14627`); consume them in `scheduleSporadicArrival`'s type weights (premium → tourists/colonists & higher spendMult pods; risky → traders/industrials & theft pressure). Zero new simulation; one consumer function. Suddenly the whole district layer (O4), posture, customs, cameras — all of it — steers *who comes*, which is a thing the player watches.
4. **Wire the wear multipliers that the UI already claims.** Multiply stove/workbench/grow rates and berth passenger throughput by `maintenanceOutputMultiplierFromDebt(debt)` at their existing production sites (`:14114,14136,14157`, spawn at `:8297`). ~10 lines, converts V4 from caption fiction to a real upkeep loop and finally gives repair jobs a reason to exist.
5. **Let residents leave.** The threat is fully instrumented (leaveIntent, penalty constant, counters, driver row). One departure branch (`leaveIntent ≥ threshold` → walk to home ship → remove + `RESIDENT_DEPARTURE_RATING_PENALTY` + tax loss) makes P5's entire mood simulation load-bearing for T4-5 play.
6. **Price the cantina.** Call the already-written `consumeCantinaSupplies` from the drink drip and apply the already-declared 0.45 unstocked multiplier (`:382`). Two call-sites; the money faucet joins the logistics game instead of bypassing it.
7. **Give fire a reachable ignition** (kitchen heat + wear, small chance), since everything downstream of ignition — spread, module destruction, extinguishers, jobs, air crush — already works and is the game's only property-destruction system.

**And the standing cuts (unchanged from SPEC's cut list, reconfirmed):** the bridge-terminal zoo/departments (P4), the five dead utility layers (V9), the tax slider pre-T4 (S5), morale as a headline stat (P6), route-exposure/environment micro-ticks as rating inputs (M5) — none of these should receive another line of investment until the actuator edges above exist, because each is another sensor wired to the same dead bus.

*Nothing in the repo was modified; analysis via detached worktree on origin/main `171816b`.*
