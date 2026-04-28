# Economy, Morale, Station Rating

Three player-visible scalars that share no underlying model:

- **Credits** — global pool, single number.
- **Morale** — derived per tick from current state.
- **Station rating** — long-running accumulator with per-category breakdowns.

## Economy

There is **no supply-side market simulation**. Prices are hardcoded buy/sell scalars; income is event-driven.

### Income sources

| Source | File:Line |
|---|---|
| Visitor exit pay (after eating) | `mealExitPayout` `sim.ts:5025` |
| Market spend (visitor-driven) | `marketSpendPerSec` `sim.ts:5020` × spendMultiplier × marketHelperMultiplier × tax-aware factor |
| Resident tax | `applyResidentTaxes` `sim.ts:6357` — `RESIDENT_TAX_PER_HEAD = 0.42` per `RESIDENT_TAX_PERIOD = 24 s` (`sim.ts:149`–150) |
| Manual sell-materials | `sellMaterials` `sim.ts:8340` |
| Manual sell-raw-food | `sellRawFood` `sim.ts:8356` |

### Costs

| Cost | File:Line |
|---|---|
| Crew payroll | `applyCrewPayroll` `sim.ts:6340` — `PAYROLL_PER_CREW = 0.32` per `PAYROLL_PERIOD = 30 s` (`sim.ts:129`–130) |
| Hire | `HIRE_COST = 14` |
| Map expansion | `EXPANSION_COST_TIERS = [2000, 4000, 6000, 8000]` (`sim.ts:219`) |
| Manual buy-materials | `buyMaterialsDetailed` `sim.ts:8187` |
| Manual buy-raw-food | `buyRawFoodDetailed` `sim.ts:8259` |
| Bodies clearance | 6 materials per batch of 4 (`clearBodies`) |
| Construction materials | `consumeConstructionMaterials` `sim.ts:4077` |

### HUD

- `economyEl` shows `Materials | Credits` (`main.ts:...`).
- `economyFlowEl` shows `Credits/min: gross | payroll | net` (`main.ts:3979`–3980), backed by `metrics.creditsGrossPerMin`, `creditsPayrollPerMin`, `creditsNetPerMin`.

### Tax control

`state.controls.taxRate` (UI slider, 0–0.5). High tax shrinks visitor `mealExitPayout` and can push patient archetypes (rusher, lounger) past their `taxSensitivity` thresholds → visit failure → rating penalty.

## Morale (`metrics.morale`, 0–100)

Computed in `computeMetrics` (`sim.ts:6585`–6590) as `100 - crewFatigue - crewHygiene - air - power - payroll`. It's a per-tick derived number, not a stored accumulator.

`metrics.crewMoraleDrivers` is a `string[]` produced alongside, surfacing the *reasons* for the current value (e.g. "fatigue penalty", "low air").

### Player framing

Morale drives crew willingness to work — low morale increases idleReason rates and can starve job assignment. Visible in HUD + breakdown in the right sidebar.

## Station rating (0–100, starts at `STATION_RATING_START = 70` `sim.ts:209`)

A long-running accumulator, **not derived per tick**. `usageTotals.ratingDelta` is summed across:

| Source | File:Line | Effect |
|---|---|---|
| Visitor-success bonus | `visitorSuccessRatingBonus` `sim.ts:395` | + |
| Visitor-failure penalty | `addVisitorFailurePenalty` `sim.ts:404` | − (per-reason, surfaces in `metrics.stationRatingServiceFailureByReasonPerMin`) |
| Ship-skip / queue timeout | `addShipSkipPenalty` | − |
| Walk dissatisfaction | (path failures during service) | − |
| Route exposure | scored when visitors complete service trips | − if visitors crossed cargo/service/security/residential spaces |
| Resident retention | `RESIDENT_RETENTION_RATING_BONUS_PER_SEC = 0.0009` | + |
| Resident departure | `RESIDENT_DEPARTURE_RATING_PENALTY = 0.4` per departure (`sim.ts:154`) | − |

Trend per minute: `ratingDelta / runMinutes`. Per-category visible breakdown: `metrics.stationRatingPenaltyPerMin` and `metrics.stationRatingBonusPerMin`. Penalty categories include `routeExposure`, surfaced in the UI as `routes` / `Bad Routes`.

`metrics.stationRatingDrivers` is a `string[]` for the alert/HUD layer.

### Effect on gameplay

- Rating is read by `maybeConvertVisitorToResident` as `ratingFactor` — higher rating, more conversions.
- Rating does NOT directly affect ship arrivals. Lane traffic volume is controlled by `LaneProfile.trafficVolume` only.

### Player framing

- Visible in HUD top strip + sidebar.
- Drivers panel surfaces the top contributors so the player can see "you're losing rating because visitors can't path to leisure".

## Crew priority preset (UI control)

Not strictly economy but related: `state.controls.crewPriorityPreset` (`main.ts:2154`) biases `assignCrewJobs` weighting. Presets: `balanced`, `life-support`, `food-chain`, `economy`. The `economy` preset prioritizes Workshop/Market/Cafeteria — useful when ratings are healthy and the player wants to ride the credit curve.

## Tunables

- `PAYROLL_PER_CREW`, `PAYROLL_PERIOD`, `HIRE_COST`
- `RESIDENT_TAX_PER_HEAD`, `RESIDENT_TAX_PERIOD`
- `STATION_RATING_START = 70` (`sim.ts:209`)
- `RESIDENT_RETENTION_RATING_BONUS_PER_SEC = 0.0009`
- `RESIDENT_DEPARTURE_RATING_PENALTY = 0.4`
- `VISITOR_ROUTE_EXPOSURE_RATING_PENALTY`, `RESIDENT_BAD_ROUTE_STRESS`, `CREW_PUBLIC_CROWD_DRAIN`
- All `addXxxPenalty` per-reason coefficients (search `addVisitorFailurePenalty`, `addShipSkipPenalty`)

## Trip-wires

- `metrics.morale` is **derived**, not stored. Setting it from save/load doesn't stick — recompute its drivers from state.
- `usageTotals.ratingDelta` is the long-running accumulator; HUD's rating reading is `STATION_RATING_START + ratingDelta` clamped 0–100. Don't overwrite ratingDelta on load — `hydrateStateFromSave` deliberately preserves it (`save.ts:688`).
- Visitor failure penalties are *per-reason*. Adding a new failure mode means adding a category to `addVisitorFailurePenalty` AND to the breakdown read in `refreshAlertPanel`.
- Tax rate is bounded `0–0.5` in the UI slider. Going outside that range will pass through but the archetype `taxSensitivity` formula is only validated for that range.
