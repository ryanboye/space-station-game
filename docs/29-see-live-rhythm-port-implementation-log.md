# See, Live, Rhythm, Port: Implementation Log

Status: active goal log. Plan of record: `docs/28-see-live-rhythm-port-roadmap.md`.

Branch: `codex/two-berth-shift`

## Validation Fixtures

### Small-Scale Design Gate

- Scenario: Two-Berth Shift / starter flow
- Purpose: decide whether the loop is understandable, responsive, and fun
- Required evidence: browser play with management panels closed for the relevant observation period

### Scale And Performance Gate

- Save: `Codex Scale Run - Final Tier 6 Smooth`
- Baseline: 50 crew, Tier 6, multiple active ships, 100% global oxygen
- Purpose: verify legibility, behavioral stability, pathfinding load, and presentation smoothness
- Required evidence: browser play at 1x and accelerated speed with the performance HUD sampled

## Stage 1 Audit

Final dispositions must come from play at both fixtures. Code reading may identify candidates but does not close a row.

| System | Initial hypothesis | Small-fixture evidence | Scale-fixture evidence | Disposition | Required action |
|---|---|---|---|---|---|
| Sanitation | Surface | Dirt appears progressively and cleaning clears it tile by tile | Filthy-concourse alert and local thoughts remained readable at 50 crew | Surface | Keep world decals, sampled speech, and Cleaning lever |
| Maintenance/module condition | Surface | Worn modules show progressive strain/fault decals and a local repair lever | Cached decals remained readable without adding dynamic per-frame fields | Surface | Keep cached condition presentation |
| Local oxygen/pressure | Complete | Persistent air status and occupied-room warning identify unsafe space | 100% headline plus 315 poorly supplied tiles remained investigative, not panic | Complete | Keep local occupied-risk priority and Air overlay |
| Thermal/stale air | Demote candidate | No distinct corrective decision emerged in focused play | Dynamic thermal presentation would add noise at scale | Demote | Retain diagnostic overlay; no always-on world treatment |
| Crew needs/payroll | Complete | Staggered needs, fixture destinations, movement penalty, morale, payroll, and resignation are visible | 50-crew roster crossed a handover without critical synchronized collapse | Complete | Retain slower watch-scale need clocks and sampled markers |
| Visitor needs/patience | Surface/Complete | Visitors delay complaints until station entry and visibly seek providers | 62 visitors surfaced food, restroom, cleanliness, and satisfaction signals locally | Complete | Keep sampled thoughts and localized facility labels |
| Resident needs | Complete | Residents physically reserve beds, hygiene, meals, and seating | Save migration preserved residents and shared-provider behavior | Complete | Reuse shared provider/reservation template |
| Queueing/throughput | Surface/Complete | Serving queues and loose restroom waits show distinct causes and levers | Food line exposed 24 waiting and named slow self-service/Service staffing | Complete | Keep typed queue behavior; avoid universal single-file lines |
| Cargo/construction blockage | Surface | Cargo lots, loads moving, blocked reason, and route are world-visible | Existing 50-crew freight pressure remained attributable to Cargo labor/storage | Complete | Cargo-arm and tank handoffs must target reachable work tiles |
| Theft/security | Surface/Complete | Incident thoughts and local response state identify prevention/response | Theft location, dispatch state, elapsed time, and no-responder cause were visible | Complete | Preserve in-world response and Security staffing lever |
| Berth turnaround | Surface | Berth cards show ship, phase, timer, and each live promise | Three simultaneous ships remained scannable; settlement named failed promises | Complete | Keep localized progress chips and adaptation receipts |
| Reputation/rating | Complete/Demote candidate | Standing affects offer value and traffic pull without becoming manifest homework | Service report and premium/rough pull remained secondary at scale | Complete | Keep as traffic/value input, not a primary per-ship grade loop |
| Legacy progression gates | Retire/consolidate | Global goal and tier progress are visible; unlock checks share one resolver | Tier 6 save migrated with all progression intact | Consolidate | `getUnlockTier` is the surviving resolver; no parallel UI gate |
| Dormant utility/property systems | Demote/Retire candidate | No minute-one decision justified headline presentation | No useful scale intervention emerged | Demote | Keep diagnostics only until a complete loop consumes them |

## Stage Gates

### Stage 1: See The Station

- Status: complete
- Small-scale play record: 2026-07-21 Two-Berth/fuel-day runs
- Scale play record: 2026-07-21 Tier 6 saved-station run
- Exit-test waivers: thermal is intentionally demoted; not every healthy system emits a marker
- Checkpoint commit: included in final goal checkpoint

### Stage 2: Complete The Living Crowd

- Status: complete
- Small-scale play record: shared meals, drinks, beds, hygiene, seats, and exclusive fixture use observed
- Scale play record: shared providers and sampled needs remained legible with 50 crew and 62 visitors
- Exit-test waivers: loose fixture waiting replaces formal queues for toilets, beds, and seats by design
- Checkpoint commit: included in final goal checkpoint

### Stage 3: Give The Station Rhythm

- Status: complete
- Small-scale play record: Alpha/Beta/Gamma banks, on/reserve/off thirds, targets, and recall exercised
- Scale play record: live Beta-to-Gamma handover at 1x and 4x
- Exit-test waivers: per-facility calendars and per-person timetables deferred under the minimum-v1 rule; current play did not justify their complexity
- Checkpoint commit: included in final goal checkpoint

### Stage 4: One Port Day With Fuel

- Status: complete
- Small-scale play record: supplier procurement, physical unload, tank stock, pump transfer, customer sale, settlement economics, and failure advice exercised
- Scale play record: legacy 50-crew save migration and shared cargo-path performance exercised; existing save contains no fuel modules
- Exit-test waivers: adding fuel modules to the canonical scale save was waived to preserve the fixture; its freight jobs use the same bounded dispatcher/path/handoff machinery. Central storage completed too slowly under the original deadline, while berth-local buffers completed customer service, proving the intended route/labor tradeoff without claiming both are equally tuned.
- Checkpoint commit: included in final goal checkpoint

## Playtest Records

### 2026-07-21 - Stages 1-4 - Two-Berth / Fuel Day

**Build/state**

- Scenario: `?scenario=fuel-day&diag=1`
- Population and traffic: 12 crew; one supplier plus one overlapping fuel customer; two pump-equipped berths
- Simulation speed and duration: 1x setup, 4x through multiple complete watch handovers

**Observed without management panels**

- Berth cards exposed ship identity, phase, deadline, and promise progress.
- Tank stock and moving-load counts changed as crew physically carried six-unit batches.
- Crew needs appeared as a staggered handful during the first watch rather than a station-wide collapse.
- Supplier and customer failures named fuel stock, tank capacity, pump access, Cargo labor, or route length and focused the relevant fixture.

**Decisions made**

- Raised Cargo from one to four staff for the overlap.
- Compared remote/central routing with berth-local tanks and pumps.
- Accepted procurement cost before delivery and inspected gross versus net settlement.

**Failures and diagnosis**

- First inbound run stalled because cargo jobs targeted the occupied cargo-arm tile; fixed with a physical arm-side handoff.
- Supplier loads then stalled on the occupied tank origin; fixed with a separate tank-side handoff and logical inventory node.
- Original crew clocks made nearly all 12 crew critical inside one watch despite adequate facilities; retuned needs to watch-scale periods.
- Generic deadlines ignored fuel volume; fuel quantity now contributes handling time.

**Performance**

- Browser stayed responsive at 4x; bounded fuel jobs used the existing dispatcher and path cache.
- Atlas validation passed with 199 keys.

**Exit-test result**

- Passed: complete visible demand-to-payment grammar, physical supplier/customer routes, actionable failure, attributable economics, future demand track record, one new service only.
- Waived: canonical 50-crew save has no fuel fixtures; see scale record and Stage 4 waiver.

### 2026-07-21 - Stages 1-4 - Fifty-Crew Station

**Build/state**

- Save: `Codex Scale Run - Final Tier 6 Smooth`
- Population and traffic: 50 crew, 45-62 visitors, two to three active ships, Tier 6, 100% global oxygen
- Simulation speed and duration: 1x observation followed by 4x across Beta-to-Gamma handover

**Observed without management panels**

- Movement and browser interaction remained responsive while berth, crowd, queue, dirt, and incident callouts updated.
- World labels exposed a 24-person food line, restroom demand, dirty floors, positive drink feedback, and local theft response.
- Watch strip changed from 16 on / 17 reserve / 17 off to 17 on / 16 reserve / 17 off at handover.
- No whole-crew critical-needs collapse occurred; 52 sleep positions remained sufficient.

**Decisions made**

- Left the established 14 Service / 8 Cargo / 5 Maintenance / 8 Cleaning roster unchanged to observe migration and autonomous handover.
- Did not mutate the named scale fixture by adding the new fuel room recipe.

**Failures and diagnosis**

- Existing station still produces visible service failures under heavy traffic: food queue, restroom demand, freight backlog, and unstaffed theft.
- These are diagnosed at the affected facility/incident and present staffing, capacity, route, or security levers rather than opaque ratings.

**Performance**

- 50 crew, 62 visitors, and three active ships remained interactive at 4x through a watch boundary.
- No presentation stall or synchronized movement jump was observed; interpolation remains independent of simulation speed.

**Exit-test result**

- Passed: scale legibility, save migration, watch handover, staggered needs, shared providers, and presentation responsiveness.
- Waived: fuel-specific fixture construction in this named save, for the reason recorded above.

## Playtest Record Template

### YYYY-MM-DD - Stage N - Fixture

**Build/state**

- Commit:
- Scenario/save:
- Population and traffic:
- Simulation speed and duration:

**Observed without management panels**

-

**Decisions made**

-

**Failures and diagnosis**

-

**Performance**

- rAF/render:
- Simulation/pathfinding:

**Exit-test result**

- Passed:
- Failed:
- Waived with reason:

**Changes required before advancement**

-
