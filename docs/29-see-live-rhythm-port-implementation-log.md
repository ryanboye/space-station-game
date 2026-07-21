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
| Sanitation | Surface | Pending | Pending | Pending | Tune visible thresholds and cleaning theater |
| Maintenance/module condition | Surface | Pending | Pending | Pending | Add module condition presentation |
| Local oxygen/pressure | Complete | Pending | Pending | Pending | Prioritize occupied risk and visible local effects |
| Thermal/stale air | Demote candidate | Pending | Pending | Pending | Validate consequence before dynamic presentation |
| Crew needs/payroll | Complete | Pending | Pending | Pending | Clarify state, consequence, and corrective lever |
| Visitor needs/patience | Surface/Complete | Pending | Pending | Pending | Preserve sampled thoughts; localize failure cause |
| Resident needs | Complete | Pending | Pending | Pending | Stage 2 physical providers |
| Queueing/throughput | Surface/Complete | Pending | Pending | Pending | Facility load and typed queue work |
| Cargo/construction blockage | Surface | Pending | Pending | Pending | World-side blockage and material-flow feedback |
| Theft/security | Surface/Complete | Pending | Pending | Pending | Clarify prevention, response, and outcome in-world |
| Berth turnaround | Surface | Pending | Pending | Pending | Preserve live progress and localized receipts |
| Reputation/rating | Complete/Demote candidate | Pending | Pending | Pending | Identify live consumers or demote headline weight |
| Legacy progression gates | Retire/consolidate | Pending | Pending | Pending | One unlock resolver and no dormant tick work |
| Dormant utility/property systems | Demote/Retire candidate | Pending | Pending | Pending | Record explicit fate |

## Stage Gates

### Stage 1: See The Station

- Status: not started
- Small-scale play record: pending
- Scale play record: pending
- Exit-test waivers: none
- Checkpoint commit: pending

### Stage 2: Complete The Living Crowd

- Status: blocked by Stage 1 gate
- Small-scale play record: pending
- Scale play record: pending
- Exit-test waivers: none
- Checkpoint commit: pending

### Stage 3: Give The Station Rhythm

- Status: blocked by Stage 2 gate
- Small-scale play record: pending
- Scale play record: pending
- Exit-test waivers: none
- Checkpoint commit: pending

### Stage 4: One Port Day With Fuel

- Status: blocked by Stage 3 gate
- Small-scale play record: pending
- Scale play record: pending
- Exit-test waivers: none
- Checkpoint commit: pending

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

