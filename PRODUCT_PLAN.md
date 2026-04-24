# Expanse Station Sim — Product Plan (Requirements Draft)

## 0) Current Execution Status
*Last updated: 2026-04-24 01:30Z by tinyclaw (PM-loop run 4 wrap, fire 10/10). Live playtest build: <https://bmo.ryanboye.com/spacegame/> @ main `3feaab6`.*

### Current milestone
**M1.2 Sprite-Pipeline + Render Hardening — sim-side hardening shipped, art pending.** PM-loop run 4 closed out 6 PRs + 1 issue + a standalone meshy-pipeline tool. Sim correctness arc landed: doors-as-pressure-barriers (#99), scenario-level pressurization regression (#101), dead reactor pressurization fallback removed (#102), `isPressureBarrier` promoted to `types.ts` for future barrier types (#104), `tierRequirementText` fallback chain single-sourced (#105). Issue #103 filed for door open/closed-state debt. Sprite-pipeline gen + render-bug debug chain shipped earlier in the day (#94-#98 by BMO + seb). Dual-tilemap walls live behind `?walls=dual` flag (#98) with placeholder sprites — art reroll + PHash-vs-PA gate are next-session priorities.

### Lanes (active bots)
- **tinyclaw** — project management, sim data + state transitions, sprite generation via pixellab + nano-banana.
- **seb** — render integration, deploy ops, sprite packing. Full pipeline ownership on the render side.
- **BMO** (awfml's bot) — spec + PR review + deploy coordination + mechanics-reference docs + morning-status writeups.
- **barnacle** (barn's bot) — harness scenarios + per-tier unlock smoke tests + QA diagnostics.

### Shipped — merged overnight 2026-04-21/22
| PR | Commit | What |
|----|--------|------|
| #3 | `046015d` | systemd pull-and-build deploy wiring → `bmo.ryanboye.com/spacegame/` |
| #5 | `93a0cd6` | unlocks v2 scaffold — 6-tier shape + trigger predicate interface + lifetime counter stubs |
| #6 | `3e519bd` | wire `creditsEarnedLifetime` + `incidentsResolvedLifetime` increment sites |
| #7 | `bb49e62` | progression UI render primitives (`data-progression-state` attr, tooltip singleton, tier-flash overlay) |
| #8 | `7607531` | deploy v1.1 — `build.sh` force-on-empty + README ProtectHome + ReadWritePaths notes |
| #9 | `1edd242` | predicate-driven tier advance — loop over `UNLOCK_DEFINITIONS.trigger.predicate` + `archetypesServedLifetime` |
| #10 | `dd7c7ad` | `tradeCyclesCompletedLifetime` increment at workshop→market sale |
| #11 | `323ac8c` | phase-2 wiring — progression UI reads live `UnlockState`, flash fires on advance |
| #12 | `864fb02` | S2 — status line uses `PROGRESSION_TOOLTIP_COPY` not legacy `UNLOCK_CRITERIA` |
| #13 | `b1db92f` | 6 nano-banana tier-unlock icons (`icon.tier1_unlock` … `icon.tier6_unlock`) |
| #14 | `2b72dfe` | S1 — Build & Room Legend auto-expands at tiers 0–2 |
| #15 | `342af5f` | S2.1 — progression modal header uses new copy |
| #16 | `4f21474` | S2.2 — modal tier-cards "Unlock Requirement" copy aligned |
| #17 | `ad0bf7a` | docs — Section 0 current execution status for bot-swarm coordination |
| #18 | `fc6aee7` | hygiene — gitignore `tools/sprites/out/processed/` + untrack 73 intermediates |
| #20 | `d9fa188` | onboarding — pre-place 2-tile visitor dock on fresh start (east hull) |
| #21 | `dbc2272` | render/progression — quest bar pinned sidebar strip ("what do I do now") |
| #22 | `00d9a35` | progression — T0→T1 fires on first-visitor-arrives + 5 stale copy sites swept |
| #23 | `389042d` | docs — §0 refresh post PRs #17-22 |
| #24 | `a59ac5f` | chore — sweep legacy UNLOCK_CRITERIA copy in locked-room/module tooltips |
| #25 | `f9a3dcb` | docs — §0 refresh post PRs #23-24 |
| #26 | `7380c26` | chore — tierProgressSnapshot uses UNLOCK_DEFINITIONS (progress bar math for 6 tiers) |
| #27 | `7d0d165` | feat — pixellab generator + runtime pipeline toggle (infra) *[ripped out in #36]* |
| #28 | `d0e5e0a` | feat — pixellab atlas batch (111 keys) *[ripped out in #36]* |
| #29 | `e0b7e70` | fix(progression) — save/load counters + tier cap + sell credits + T5 proxies |
| #30 | `42a5ee9` | fix(ui) — TIER_PRESENTATION T1/T2/T3 aligned with PROGRESSION_TOOLTIP_COPY |
| #31 | `31ad50f` | fix(sim) — SpritePipeline type moved from render/ to sim/types.ts |
| #32 | `1d77af4` | chore — retire dead unlockProgressText chain + UNLOCK_CRITERIA |
| #33 | `e1815c4` | chore — retire 4 dead feature flags |
| #34 | `3cefd34` | chore — retire ModuleType.GrowTray alias + normalizeModuleType |
| #35 | `31451c0` | chore(ui) — dock-modal checkbox handlers → 2 loops |
| #4 | `8b97067` | feat(harness) — Harness v1.0 Playwright runner + window hooks |
| #38 | `7ca4029` | fix(ci) — atlas validator advisory + v1 profile |
| #19 | `d110ece` | test(harness) — agent-movement spec |
| #36 | `30fc12c` | revert(sprites) — restored curated baseline atlas + ripped pipelines |
| #37 | `2644528` | feat(sim) — src/sim/index.ts barrel for public API |
| #39 | `01be383` | chore — final dead-code sweep (agent-sheet, #load CSS, loadColor) |
| #40 | — | docs — §0 refresh post #32-39 |
| #41 | `b9b06ef` | feat(ui) — build toolbar replaces ~30 hotkeys with clickable buttons |
| #42 | — | docs — phase-5 mechanics ref + sprite-v2 design doc preread notes |
| #43 | `29092f9` | fix(ui) — toolbar buttons pack horizontally, not full-width |
| #44 | `2f74a10` | test — T3/T4 predicate coverage + rebuildDockEntities topology roundtrip |
| #45 | `4bb75b2` | chore(ui) — modal open/close helper, 8 modals → 1 wireModal + 8 calls |
| #46 | `92671f0` | tools/sprites — prelim modules for gpt-image-1 pipeline |
| #47 | `cf8b4c2` | chore(sim) — derive UNLOCK_IDS_BY_TIER from UNLOCK_DEFINITIONS |
| #48 | `1e3c859` | chore(ui) — move toggle-button label sync out of frame() hot loop |
| #49 | `ab76ec0` | docs(plan) — expand option-B backlog with hard-blocker findings |
| #50 | `6393eeb` | feat(ui) — autosave to localStorage every 60s + opt-in cold-start load |
| #51 | `4f0abb9` | test — actorsTreatedLifetime increments on health recovery |
| #53 | `3fcc626` | test+fix — rebuildDockEntities paint/split/3+clusters coverage + id-collision fix |
| #56 | `0e9b691` | docs(plan) — §0 refresh post #40-53 + starter-refactor pivot lock |
| #57 | `81f7752` | tools/sprites — rename gpt-image-1 → gpt-image-2 in prelim modules |
| #58 | `4a8c3e4` | feat(sprites) — update rate-limits.mjs to gpt-image-2 constants |
| #59 | `fe6b6b0` | feat(sprites) — unpack-atlas-sheet.mjs for ChatGPT-generated atlas sheets |
| #60 | `785ad66` | feat(progression) — tier flash pauses sim + click-dismiss modal backdrop |
| #61 | `191bfd8` | feat(hud) — remove legend + guidance panels, add top status strip |
| #62 | `e36ee91` | chore(ui) — cache sprite-status DOM update behind composite key |
| #63 | `c97ddec` | test — T1 archetype diversity regression guard for T2 reachability |
| #64 | `64bdd81` | test — split-with-docked-ship reference preservation |
| #65 | `9ccc6ca` | feat(ui) — dev-mode time-to-tier overlay (?dev=1) |
| #66 | `a454114` | test — three-way dock split dedupes ids across consumedIds Set |
| #67 | `fd6041b` | docs(plan) — §0 refresh post run-3 fires 1-5 (#60-#66) |
| #68 | `07c606d` | test — decouple SHIP_MIN_DOCK_AREA from cluster-size test + 3-way keeper invariant |
| #69 | `aecc339` | test — dock-split coverage sweep (asymmetric + 3-way+ship + shrink-downgrade) |
| #70 | `15f893b` | chore(sim) — prune unused setModule from public-API barrel |
| #71 | `0bbd113` | docs(plan) — §0 final refresh post run-3 wrap (#67–#70) |
| #72 | `288aad2` | sprites — promote 5 tile-editor crops from staging to atlas |
| #73 | `a63c918` | feat(dev) — `?scenario=<name>` cold-start loader (starter, t1-ready, t5-ready, t6-trophy) |
| #74 | `2dde212` | feat(render) — glow pass (wall lights, stoves, reactor, med-beds) |
| #75 | `d053684` | sprites — iter-1 rimworld-style walls + modules atlas via gpt-image-2 |
| #76 | `513e358` | sprites — chroma-key magenta bleed fix on iter-1 walls |
| #77 | `6f14a88` | sprites — iter-2 agents (18 humans via gpt-image-2) |
| #78 | `008a995` | fix(render) — cache-bust atlas.png with `?v={version}` |
| #79 | `5541bb1` | sprites — iter-2 ships (5 vessel types) |
| #80 | `cf8a514` | feat(scenarios) — demo-station (10-room T6 showcase, programmatic overlay on `?scenario=demo-station`) |
| #81 | `32e83a1` | sprites — walls-v3 semi-3D depth per awfml |
| #82 | `6e6a093` | fix(render) — dedicated tile.wall.straight.vertical sprite |
| #83 | `e1f6b64` | sprites — modules-v2 semi-3D depth |
| #84 | `029122a` | sprites/render — kill red room-overlay fallback + subtler floors |
| #85 | `f152aa9` | sprites — modules-v3 STRICT top-down per awfml |
| #86 | `cdbc5f6` | sprites — agents-v2 RimWorld pawn style (floating head) |
| #87 | `8df7507` | harness — per-sprite A/B gate + regression detector (tinyclaw #1 + #2) |
| #88 | `d587172` | harness — prompt-macro library + per-pack archive side-effect (tinyclaw #3 + #4) |
| #89 | `f09c1e8` | refactor(render) — collapse dock-facade to 4+rotation |
| #90 | `11121b6` | chore(sprites) — delete dead overlay.wall.exterior.* keys |
| #91 | `d9840d9` | sprites — reroll batch-1, 9 genuine rerolls post pass-1 review |
| #92 | `a4be6ab` | sprites — walls-v5 cool-palette reroll per team diagnosis |
| #93 | `0b1e31e` | tools(sprites) — verify-floor-periodicity gate at pack-time (tinyclaw, blocks per-cell-motif regressions) |
| #94 | `5316cee` | sprites — pass-7 room-floor texture refactor (ditch icon-per-cell) |
| #95 | `5b537a4` | fix(render) — strip room.* overlay in sprite mode, let tile textures speak |
| #96 | `000bb53` | fix(render) — tone down glow-pass alpha per awfml feedback |
| #97 | `4054ac0` | fix(render) — tone inactive-dim + depressurized-wash alphas (cosmetic rust fix, superseded by #99 sim-side) |
| #98 | `c1dfe8d` | feat(render) — dual-tilemap wall pass (Path A / RimWorld technique, behind `?walls=dual` flag) |
| #99 | `10d4930` | fix(sim) — doors count as pressure barriers (seals demo-station, tinyclaw) |
| #100 | `ac16a6e` | docs(plan) — §0 refresh post #71-99 + PM-loop run 4 turn 2 (tinyclaw) |
| #101 | `a845ba3` | test(sim) — scenario-level pressurization regression for demo-station (tinyclaw) |
| #102 | `b321294` | chore(sim) — drop dead reactor pressurization fallback (tinyclaw) |
| #104 | `8cf4df6` | refactor(sim) — promote isPressureBarrier to types.ts (tinyclaw) |
| #105 | `3feaab6` | chore(ui) — single-source tierRequirementText fallback chain (tinyclaw) |

### Open Issues
- **#103** — Debt: transient door open/closed state (post-#99 followup). Low priority; file-and-forget until heat/cold/air-quality mechanics make the transient-barrier model matter.

### Open PRs
- **#2** `feat: atlas-preview.html — debug-oriented sprite atlas inspector` (VoX). Static debug page, non-blocking. Age: 2d.
- **#52** `tools/sprites: qa-review.mjs (gpt-image-1 v2 QA gate)` (sammcgrail/seb). Blocked on awfml API key + QA ownership decision. Becomes the spine of the PHash-vs-PA gate per backlog item #2.
- **#54** `docs: starter-state-refactor design doc (4-PR breakdown for option-B)` (sammcgrail/seb). v3 locked per tinyclaw layout review. Blocked on awfml tutorial-pacing answer.
- **#55** `ci: advisory mobile-baseline gate via check-mobile.py` (sammcgrail/seb). Vendors seb's 9-item checklist; needs 4-agent ritual before merge.

### Backlog (priority-ordered)
1. **Dual-tilemap wall art gen-2** — Path A placeholder sprites live (#98). Next: reroll the 6 wall shapes via gpt-image-2 with PA reference + rim-lighting + per-pixel depth. PHash-vs-PA gate enforces proximity. BMO lane.
2. **PHash-vs-PA gate at pack-time** (tinyclaw proposal, elevated to next-session turn-1 priority per seb+BMO handoff). Computes perceptual similarity score against awfml's shared PA tileset for each gen'd sprite; rejects at pack-time if distance > threshold. Fundamentally cheaper than reroll-until-vibes-align.
3. **Room-texture v2 multi-hue palette** — pass-7 textures still read as warm-variant aggregate (awfml's "pokemon red"). Need true material distinctness (cool-grey industrial deck, off-white tile, navy rubberized, cream linoleum, grey concrete). Pixel-trace from PA references for the hard cases. Pairs with #2.
4. **Sprite pipeline v2 (gpt-image-2)** — iter pipeline LIVE (#75-94). 5 original awfml decisions (single-vs-sheet, reference-image-use, QA ownership, bulk-trigger, archive policy) still open but unblocking as methodology settles post pass-7. seb's QA-review gate PR #52 still open pending API key.
5. **Phase 5 mechanics ref** — BMO doc live at <https://bmo.ryanboye.com/spacegame-plan/phase-5-mechanics.html>. 6 awfml decisions open (medSupply source, clinic staffing, propagation, overflow curve, contagion model, treatment duration). Blocked on awfml.
6. **Starter food chain (option B)** — visitors arrive but starve within 60s of T1 flash. Seb's design doc (PR #54, v3) locks 4-PR breakdown: **PR-1** extract `runActivationPipeline`, **PR-2** Reactor-only pre-activation + `airQuality=100` buffer + T1 task nudge, **PR-3** pre-place Kitchen + Hydroponics + Cafeteria, **PR-4** seed crew + jobs. Blocked on awfml's tutorial-pacing answer.
7. **Toolbar/HUD rework** — awfml's ask. #41 (toolbar), #60 (popup pause), #61 (status strip) shipped key pieces. Next sweep per awfml.
8. **Testing gap sweep** — T3/T4/T5/T6 predicate tests shipped (#44, #51, #63). Scenario-level pressurization regression (demo-station → 100% pressurized) queued for tinyclaw next turn.
9. **Visitor archetype behavior differentiation** — brainstorm posted 2026-04-22; BMO endorsed parallel-able with Phase 5. Makes T2 `archetypesServedLifetime >= 3` predicate measure real gameplay instead of string counting. Blocked on awfml priority call.
10. **T6 specialization design (open question)** — "Tutorial complete" minimal-viable per BMO: flash trophy state, full sandbox. Dual-use as canonical gate for future content drops (M2 military ships, station-identity system, advanced tuning).
11. **Post-#99 followups** — (a) PR #97 alpha walkback once dual-tilemap walls land, (b) reactor pressurization fallback audit at sim.ts:2747/2752, (c) promote `isPressureBarrier` to types.ts when 2nd barrier type is added, (d) file door open/closed state debt item.
12. **Dev-mode telemetry JSONL emit** (from #65 brainstorm) — `buildDevTierOverlayString` exported pure; layer change-detector + JSONL stdout on tier advance. ~20-30 LoC. Awaiting awfml greenlight on `?telemetry=1`.
13. **Ship.bayTiles stale-reference post-split** — remaining dock-entities gap from #66 review (needs sim fix, not just test).
14. **`tierRequirementText` single-source fallback chain** — small hygiene, low-priority.

### Recent activity snapshot (2026-04-23 — 29 PRs across BMO + tinyclaw, capped by PM-loop run 4 start at 23:15Z)
- **Sprite pipeline v2 live**: iter-1 through pass-7 via gpt-image-2 direct (#75, #77, #79, #83, #85, #86, #91, #92, #94). Curated atlas re-grown from placeholders to pass-7 room-floor textures (ditched icon-per-cell antipattern).
- **Render-bug debug chain**: the "pokemon-red aggregate" was diagnosed + fixed today across 4 passes — #95 (strip room overlay) → #96 (tone glow alphas) → #97 (tone inactive-dim + depressurized-wash alphas, cosmetic) → #99 (doors as pressure barriers, sim-side root cause). Root cause per BMO's bisect: two always-on overlay passes compounding multiplicatively on every interior tile because demo-station's doors leaked vacuum → depressurized-wash fired everywhere. #99 makes pressurization trustworthy; #97's alpha walkback is queued once awfml greenlights the dual-tilemap wall geometry.
- **Dual-tilemap walls shipped behind flag** (#98, Path A / RimWorld 5-sprite technique). Placeholder sprites; gen-2 art reroll + PHash-vs-PA-reference gate queued.
- **Harness additions** (tinyclaw #1-#4 from harness-proposal): per-sprite A/B gate + regression detector (#87), prompt-macro library + per-pack archive (#88), verify-floor-periodicity gate (#93).
- **Scenario infrastructure**: `?scenario=<name>` URL loader (#73) with starter/t1-ready/t5-ready/t6-trophy fixtures; BMO extended to `demo-station` 10-room programmatic layout (#80).
- **Glow pass** (#74) — wall lights, stoves, reactor, med-beds — now per-toggle (Glow ON/OFF), alpha-tuned in #96.
- **PM-loop run 4 closed (23:15Z–01:30Z)** — 6 PRs merged (#99/#100/#101/#102/#104/#105), 1 issue filed (#103), 1 standalone tool shipped (~/projects/meshy-pipeline/). Sim-correctness arc complete: doors-as-barriers + scenario regression + dead-fallback removal + helper-promotion + UI hygiene.
- **Methodology lessons baked in** (seb memory ids 508–512): review bar is "matches target", not "better than before"; gate-as-arbiter before vibe-shipping; research prior art first (dual-tilemap); version-pin every review fetch against CDN cache; PA tileset is ground-truth reference, not calibration.
- **Brainstorms queued for awfml**: `?telemetry=1` JSONL emit (#65 follow-up), PHash-vs-PA gate as pack-time arbiter (next-session priority per seb+BMO handoff), multi-hue palette refresh for room-floor textures.

### Risks / open questions
- Phase 5 predicate (T5) uses a proxy (`actorsTreatedLifetime++` on health-state recovery to `healthy`) until Phase 5 producer events land. Proxy is monotonic + works, but semantically "treatments ≠ treatees".
- T6 specialization predicate intentionally no-op. BMO's minimum-viable path (trophy state, future gate) is the current agreed strawman.
- Starter state has no food chain — visitors arrive, T1 flash fires, then visitors starve ~60s later. Option-B design doc (#54 v3) locks 4-PR path; awaiting awfml tutorial-pacing answer to unblock PR-2.
- **Air-buffer duration risk** — PR-2 ships `airQuality=100` as a finite buffer; if air decays too fast via `(airSupply - airDemand) * dt * 1.7` before T1 LifeSupport task fires, crew go distress in T0. Acceptance test `testColdStartAirBufferExceedsT1UnlockTime` pins this contract.
- **Doors-as-pressure-barriers semantics (new, #99)** — current default is "doors always sealed." Long-term this should become transient open/closed state (sealed unless traversed-within-N-ticks). File as debt item. Meanwhile, `metrics.leakingTiles` and `leakPenalty` now fire only on actual hull gaps rather than every door; confirm penalty magnitude still lands where we want or walk it back.
- **Reactor pressurization fallback** (sim.ts:2747, 2752) — `room === RoomType.Reactor ||` short-circuits the 70% pressurization check. Architect review on PR #99 notes this may now be dead code since sealed reactors pressurize naturally; leave in place pending a defensive-audit PR with tests.
- **PR #97 alpha walkback** — dim/depressurized-wash alphas were tuned DOWN to paper over the rust aggregate. Now that #99 makes pressurization trustworthy, walk back to pre-#97 values. BMO holding the change until dual-tilemap walls land so two visual variables don't swap at once.
- Visual regression baseline absent. Harness v1.0 (#4) has Playwright hooks + CI advisory wired. Baseline screenshot step is follow-up.
- **Sprite gen-default-warm bias** — gpt-image-2 defaults to warm-hue material interpretations. "Linoleum cream" and "wood parquet" both come back warm; so do "tile.reactor" and "tile.cafeteria." Fix is to pin per-sprite PA reference images and enforce PHash/SSIM distance at pack-time (seb's PR #52 gate + tinyclaw's proposed PA-reference scalar). Art rerolls without this gate will regress.

### Ritual
Before merging ANY PR touching `src/sim/` or `src/render/`: 4 parallel agents — 2 × `/simplify` + 2 × `/review`. Pure-docs PRs ≤ 50 lines can merge without the ritual. All render-touching PRs attach a Playwright smoke screenshot to the PR body.

---

## 1) Purpose
Translate the Vision Draft into implementable product requirements with explicit system behavior, player-facing outcomes, and measurable success criteria.

This document defines:
- What systems must exist and how they interrelate.
- How those systems produce tension and meaningful decisions.
- What “good” looks like in playtests.
- Open decisions requiring founder direction.

## 2) Product Goals
1. Deliver a true colony simulation loop (not a routing toy).
2. Make every major room type mechanically consequential.
3. Create recoverable failure cascades from design bottlenecks.
4. Preserve readability while adding depth.
5. Maintain web MVP performance and iteration speed.

## 3) Current Baseline (Code Reality)
The current build already includes:
- Grid construction, zones, room painting, pressurization.
- Visitors, residents, crew agents with pathing.
- Docked ship traffic with berth purpose split (`visitor` vs `residential`) and throughput stats.
- Food chain (hydroponics -> meals -> cafeteria consumption).
- Room activation checks (door, pressure, staff).
- Economy loop (credits/materials, market buy/sell, payroll/hiring).
- Crew priority selector and room diagnostic hover.

Primary gaps vs vision:
- No furniture/modules as activation requirements.
- No explicit itemized logistics entities (mostly aggregate stocks).
- No med/death/morgue chain.
- No crime/response pipeline beyond incidents counter.
- No market hall/workshop production loops.
- Pathing still too uniform/robotic under crowd stress.

## 3.1 Gameplay Loop Rebaseline (2026-02)
Roadmap focus is now explicitly aligned to the core loop:
- Ship variety and differentiated service demand.
- Resident daily-life depth with lightweight role effects.
- Staged unlock progression to prevent early overload.

Execution milestones:
1. M0 Interface Freeze + Planning Rebaseline:
- Lock data extension points in `src/sim/content/*`.
- Keep feature work behind flags (`ENABLE_UNLOCKS_V1`, `ENABLE_SHIP_PACK_V1`, `ENABLE_RESIDENT_ROUTINES_V2`).

2. M1 Unlock Progression v1:
- Tier 0 start: Reactor, Life Support, Dorm, Hygiene, Hydroponics, Kitchen, Cafeteria, Dock.
- Tier 1: Lounge + Market.
- Tier 2: Logistics Stock + Storage + Workshop.
- Tier 3: Security tuning + advanced ships + resident role depth.

3. M2 Ship Pack 1:
- Add `military` and `colonist` ship families with data-driven service tags and distinct penalties/conversion behavior.

4. M3 Resident Routine v2:
- Expand routine phases to `rest`, `errands`, `work`, `socialize`, `winddown`.
- Add roles: `market_helper`, `hydro_assist`, `civic_watch`.

5. M4 Room/Building Pack 1:
- Add `Clinic` + `MedBed`, `Brig` + `CellConsole`, `RecHall` + `RecUnit`.
- Wire to ship service tags and resident routine targets.

6. M5 Integration + Balance:
- Tune the first 20-minute complexity curve.
- Ensure lock/unmet-service messaging is legible and actionable.

Parallel art track (Nano Banana):
- Maintain a stable sprite-key contract and marker fallback.
- Integrate final atlas after gameplay-loop balance stabilization.

## 4) Design Constraints
- Platform: browser, canvas, GitHub Pages compatible.
- Visual style: simple tile-based, readability-first.
- Deterministic enough for debugging.
- Must avoid random punishment not tied to system state.

## 5) System Requirements

### 5.1 People Simulation
Actors:
- Crew: hired workers with roles, wages, rest/hygiene/meal needs.
- Residents: persistent population created via visitor conversion, tied to resident home ships and private housing.
- Visitors: transient demand spikes tied to ship traffic and visitor berths.
- Bodies/Patients/Detainees: non-standard entities for consequence loops.

Required behaviors:
- Needs degrade over time.
- Needs restoration requires physically reaching valid service locations.
- Actors have fallback behaviors when services unavailable.
- Extended unmet needs generate predictable consequences.
- Visitors can convert to residents at boarding time only when residential berth + private housing are currently available.
- Residents can later choose to leave when satisfaction remains low, freeing housing and resident berth capacity.

Acceptance criteria:
- In a station with functioning food/rest/hygiene, needs remain stable.
- Removing one service causes measurable degradation in relevant needs.
- Long unmet needs create incidents or mortality with visible warning.

### 5.2 Utilities
Core utilities:
- Power supply vs demand.
- Atmosphere production/distribution/leakage.
- Water supply/recycling.

Rules:
- Utilities are consumed by rooms and people.
- Utility deficits directly reduce room functionality before global collapse.
- Atmosphere must be local-network aware (not just one global value).

Acceptance criteria:
- Utility outage disables dependent systems in readable order.
- Player can restore utility and observe system recovery.

### 5.3 Food & Hospitality Chain
Required chain:
1. Hydroponics produces raw food.
2. Kitchen converts raw food to meals.
3. Cafeteria serves meals.
4. Visitors/residents consume meals physically.

Operational requirements:
- Kitchen and cafeteria require staffing.
- Queue spots and service spots are separate.
- Meal supply bottlenecks should manifest as visible queue pressure.

Acceptance criteria:
- Each link can bottleneck independently and be diagnosed.
- Throughput increases from adding staff/space/layout improvements.

### 5.4 Crew Quarters & Hiring Gate
Crew quarters include:
- Dorm beds (capacity gate).
- Hygiene access.
- Optional rest/recreation quality modifiers.

Rules:
- Cannot hire if no valid bed capacity.
- Crew efficiency scales with rest/hygiene health.
- Private zone violations increase incident risk.

Acceptance criteria:
- Hiring button disabled or fails with clear reason if no capacity.
- Under-provisioned quarters measurably reduce output.

### 5.5 Security & Incident Pipeline
Incident types:
- Theft, fights, trespass, vandalism (later: contraband).

Pipeline:
- Detect -> dispatch -> intervene -> resolve (warn/detain/treat).

System dependencies:
- Security office staffing and coverage radius.
- Response time influenced by distance/path congestion.
- Brig and medbay integrate into resolution outcomes.

Acceptance criteria:
- In low coverage, incidents last longer and cause larger penalties.
- Adding staffed security improves response and lowers unresolved incidents.

### 5.6 Health, Death, Morgue
Health events:
- Injury from fights/system stress.
- Illness from hygiene/sanitation collapse.
- Asphyxiation from oxygen deficit.

Rules:
- Death produces body entity.
- Body requires porter transport to morgue.
- Morgue overflow creates escalating penalties (morale/disease).

Acceptance criteria:
- Death chain is physically represented and recoverable.
- Ignoring bodies has visible compounding consequences.

### 5.7 Logistics & Items
Move from pure aggregate to hybrid model:
- Keep strategic aggregates for simplicity.
- Add explicit item jobs for critical chains (meals, medical, bodies, goods).

Required logistics features:
- Pickup/dropoff tasks with assignment.
- Storage buffers by item type.
- Transport latency affected by distance and congestion.

Acceptance criteria:
- Adding nearer storage reduces service delay.
- Hauler shortage visibly starves downstream rooms.

### 5.8 Economy & Trade
Revenue streams:
- Visitor meal/tax capture.
- Market hall transactions.
- Workshop goods sold to market/contracts.

Costs:
- Payroll, imports, maintenance, utility overhead, incident damages.

Rules:
- Economy must support early stabilization and mid-game specialization.
- Prices can fluctuate, but should remain legible and fair.
- Credit starvation should be recoverable with deliberate sacrifice/tradeoffs.

Acceptance criteria:
- Early game avoids immediate death spiral under normal play.
- Mid-game requires active optimization, not passive surplus.

### 5.9 Rooms & Modules (Furniture)
Room paint defines intent; modules define functionality.

Required module set (first implementation target):
- Dorm: Bed
- Kitchen: Stove + Prep
- Cafeteria: Table
- Hydroponics: Grow Tray
- Security: Terminal
- Medbay: Med Bed
- Workshop: Workbench
- Market: Stall

Rules:
- Room shows “inactive reason” if module requirements unmet.
- Module placement must be readable without high-fidelity art.

Acceptance criteria:
- Player can diagnose inactive room in <5 seconds using UI cues.
- Module placement materially changes throughput.

### 5.10 Pathing & Movement
Target behavior:
- Less robotic flow, fewer deadlocks, readable crowd behavior.

Requirements:
- Dynamic movement costs for congestion and unsafe routes.
- Reservation-aware service entry.
- Stuck detection and recovery.
- Role-aware routing policy (visitor vs crew vs security).
- Slight per-agent speed variance and movement jitter.

Acceptance criteria:
- No persistent clumps in healthy layouts.
- Stuck agents self-recover without manual reset.
- Equivalent routes distribute traffic over time.

### 5.11 UX, Telemetry, and Explainability
Required player-facing diagnostics:
- Per-system health lines: food, water, oxygen, power, security, health, economy.
- Root-cause messaging (“Kitchen inactive: no stove/no staff/no power”).
- Throughput stats (queues, wait times, exits/min, conversion rates).
- Overlay toggles (zones, congestion, oxygen risk, security coverage).

Acceptance criteria:
- Most failures can be traced by a first-time player without external docs.

### 5.12 Zoning and Access Control
Zone types:
- Public, Private, Staff-Only, Secure, Quarantine.

Rules:
- Visitors default to Public-only routing.
- Crew can traverse Staff-Only/Secure.
- Private/secure trespass raises incident chance and security demand.
- Access policies must be enforceable at door/path level.

Acceptance criteria:
- Changing zone policy measurably changes pathing behavior.
- Trespass incidents are traceable to zone/access mistakes.

### 5.13 Station Identity and Specialization
Supported identity tracks:
- Trade Hub, Habitat, Security Outpost, Frontier Survival.

Rules:
- Identities are strategic emphasis, not hard classes.
- Each identity affects contracts, visitors, demand mix, and bonuses.
- Players can pivot identity at cost (time/credits/disruption).

Acceptance criteria:
- Two different identities produce clearly different optimal builds.
- Identity bonuses are meaningful but do not hard-lock viability.

### 5.14 Reputation and Demand
Reputation drivers:
- Service quality, safety, throughput reliability, incident rate, mortality.

Effects:
- Visitor volume and composition.
- Contract quality.
- Market demand multipliers.

Acceptance criteria:
- Improving operations increases demand/revenue over time.
- Operational neglect lowers demand in a legible way.

### 5.15 Failure and Recovery Model
Failure policy:
- Soft-fail only for current product phase.
- No forced game-over screen.

Recovery levers:
- Emergency imports.
- Priority overrides.
- Intake throttling.
- Temporary room shutdowns.
- Zone rerouting.

Acceptance criteria:
- A deeply failing station can recover through player action.
- Recovery is costly and slower than prevention.

### 5.16 Content Unlock and Complexity Curve
Progression goals:
- Early game: stable essentials and simple chains.
- Mid game: logistics and staffing bottlenecks.
- Late game: cascading inter-system tradeoffs.

Rules:
- New systems unlock by station maturity and prerequisite infrastructure.
- Unlock pacing must not overwhelm UI clarity.

Acceptance criteria:
- First 10 minutes are learnable without external docs.
- Complexity growth is felt as new decision types, not only larger numbers.

### 5.17 Art/Furniture Delivery Requirements
Art strategy:
- Marker-first modules (letter/icon plates) are mandatory fallback.
- Placeholder sprite atlas supported via stable module IDs.
- Final art swap requires no simulation logic changes.

Acceptance criteria:
- All critical modules are readable without custom art.
- Placeholder/final sprite swaps do not break save/state compatibility.

### 5.18 AI/Pathing Delivery Requirements
Pathing requirements:
- Queue and service spots separated for all service rooms.
- Dynamic congestion-aware tile costing.
- Stuck detection and self-recovery.
- Role-aware routing policy (visitor/crew/security).
- Slight movement variance to avoid robotic lockstep.

Acceptance criteria:
- No persistent deadlock in 20-minute soak tests at 2x speed.
- Crowd flow uses multiple equivalent corridors when available.
- Service doorway clumping is greatly reduced in healthy layouts.

### 5.19 Berth-Based Docking + Resident Conversion Loop
Dock model:
- Docks are zoned berths that can be open-ended edge pockets.
- Berths are purpose-tagged as `visitor` or `residential`.
- Scheduled arrivals and queue resolution target `visitor` berths only.
- Ship size/type acceptance remains controlled by existing dock filters and berth area.

Population loop:
1. Transient ships dock at visitor berths, unload visitors, and eventually board departures.
2. On boarding, a low-probability conversion check can move eligible visitors into residents.
3. Conversion succeeds only if a compatible free residential berth and valid private resident housing assignment exist.
4. Successful conversion relocates the ship to a residential berth as a persistent resident home ship.
5. Resident home ships remain until all linked residents depart.

Housing and policy:
- Dorm/Hygiene rooms require room-level housing policy support for `crew`/`visitor`/`resident`/`private_resident`.
- Private resident assignments require explicit bed + cabin allocation and reachable resident/private hygiene support.

Economy and reputation:
- Residents pay periodic taxes and consume station services.
- Resident retention adds a small rating bonus.
- Resident departures apply a station-rating penalty and free assigned housing.

## 6) Content Scope (Ideal State)
Target room set in ideal-state design:
- Dock, Cargo Bay, Storage, Hydroponics, Kitchen, Cafeteria, Dormitory, Hygiene, Life Support, Oxygen Plant, Water Recycler, Reactor, Battery Room, Security Office, Brig, Medbay, Morgue, Market Hall, Workshop, Recreation.

## 7) Success Metrics (Playtest KPIs)
Primary:
- Session length median > 20 min in internal playtests.
- First failure understood by player (self-reported) > 80%.
- Recovery success from first major cascade > 60%.
- Distinct viable station layouts observed in test runs.

Balance targets:
- Early game: stable with mild optimization pressure.
- Mid game: regular bottlenecks requiring prioritization.
- Late game: cascading fragility unless systemized expansion.

## 8) Quality Bar (Release Gate for “Phase 2 Foundation”)
Must pass:
1. Core chains functional (food, utility, staffing, economy).
2. At least 8 meaningful room types beyond floor/wall/door/dock.
3. Furniture/module gating operational for critical rooms.
4. No hard deadlock states in 20-minute soak at 2x speed.
5. Diagnostics explain top 5 failure causes clearly.

## 9) Risks and Mitigations
Risk: System complexity outpaces clarity.  
Mitigation: Add explicit root-cause UI and staged unlocks.

Risk: Pathing cost explodes with many agents.  
Mitigation: Hybrid pathing cadence, cache, local avoidance.

Risk: Economy becomes punishing/unrecoverable.  
Mitigation: Emergency levers (imports, policy throttle, temporary closures).

Risk: Furniture creates visual clutter.  
Mitigation: marker-first fallback + clear overlays.

## 10) Post-Decision Deliverables
With decisions locked:
- phased implementation plan with scoped milestones.
- data schema spec (rooms/modules/items/jobs/modules).
- tuning sheet for economy and need decay constants.

## 11) Founder Decisions (Locked v1.0)
Confirmed decisions from founder:
1. First milestone fantasy: Trade Hub + Habitat (hybrid focus).
2. Residents convert from visitors only when a residential berth + private housing are available at boarding time.
3. Oxygen failure pacing: slow emergency window.
4. Furniture depth next phase: minimum viable required modules only.
5. Economy pressure: forgiving.
6. Crime pressure: starts light, scales harder over time.
7. Crew control depth: global priorities for now.
8. Fail-state philosophy: soft fail only (no hard fail screen yet).
9. Named individual character identity can be deferred (aggregate agents for now).
10. Reputation/faction flavor will be generic aggregate metrics for now.
11. Death/morgue presentation will be abstract for current phase.
12. First polished milestone target loop length: 20-minute target loop.

## 12) Additional Decisions (Now Resolved)
1. Logistics simulation depth: Hybrid.
- Keep broad resource pools aggregate for simplicity.
- Make critical chains physical jobs/entities:
  - meals
  - medical supplies
  - bodies
  - trade goods

2. Market Hall role: Optional specialization.
- Core station survival is possible without market hall.
- Market hall is a high-upside economic branch for trade-focused stations.

3. Ship traffic control model: Policy-driven baseline with bounded exogenous variance.
- Player directly controls average intake (`ships per cycle` policy).
- System injects bounded variation in ship size/passenger mix and occasional demand spikes.
- Goal: preserve agency while still stress-testing station robustness.

## 13) Milestone Loop Length Definition
“Milestone loop length” means how long one satisfying run should feel before the player has:
1) built a functional station,
2) hit one meaningful bottleneck/cascade,
3) stabilized or pivoted strategy.

Locked for first polished milestone: 20-minute target loop.
- Short enough for rapid iteration and replay.
- Long enough for at least one full build -> stress -> recovery arc.

## 14) Vision Coverage Checklist (Requirements Completeness)
This checklist maps Vision Draft areas to explicit requirement coverage in this plan.

1. Vision/Pillars -> Sections 2, 4, 5.15, 5.16
2. Core loop -> Sections 2, 3, 5.1–5.9
3. Simulation layers -> Sections 5.1–5.18
4. Population management -> Sections 5.1, 5.4, 5.6
5. Needs/consequences -> Sections 5.1, 5.6, 5.15
6. Room/building network -> Sections 5.2–5.9, 6
7. Furniture/modules -> Sections 5.9, 5.17
8. Logistics economy chains -> Sections 5.3, 5.7, 5.8
9. Crew roles/priorities -> Sections 5.1, 5.10
10. Security pipeline -> Section 5.5
11. Atmosphere/survival -> Sections 5.2, 5.6
12. Zoning/access -> Section 5.12
13. Economy/demand -> Sections 5.8, 5.14
14. Station identities -> Section 5.13
15. Failure cascades/recovery -> Section 5.15
16. Information design -> Section 5.11
17. AI behavior targets -> Section 5.18
18. Win/lose philosophy -> Section 5.15
19. Art/sprite plan -> Section 5.17

## 15) Immediate Next Step
With decisions now locked, next deliverable is:
- phased implementation roadmap with milestone order, dependencies, and DoD per phase.

## 16) Stabilization Milestone Baseline (Implemented)
Before adding new room/layer branches, the project now carries a stabilization baseline focused on clarity + core balance:
1. Panel clarity:
- Agent role legend (visitor/resident/crew).
- Room usage, crew status breakdown, idle reason histogram, stalled job reasons.
- Morale top contributors and room warning aggregation.

2. Air credibility:
- Deterministic low-air progression (`healthy -> distressed -> critical -> death`) with recovery window when air is restored early.
- Deaths are visible in metrics (`deaths`, `recent deaths`, `body count`) and on-map resident state tinting.

3. Utility observability:
- Room usage throughput fields (`dorm/hygiene/meals per min`) and failed need-attempt counters.
- Jobs visibility expanded (`oldest pending age`, `stalled jobs`, `stall reason mix`).

4. Test coverage additions:
- Air collapse deterministic deterioration/death scenario.
- Air recovery window scenario.
- Room usage and diagnostics assertions integrated into `test:sim`.
