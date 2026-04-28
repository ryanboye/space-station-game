# Visitors &amp; Residents

Two distinct populations sharing a lot of code. **Visitors** arrive on ships, consume services, depart. **Residents** are converted visitors who live on the station with full needs and a daily routine. Visitors drive short-term income; residents drive long-term rating bonuses + tax revenue.

## Visitors

### Lifecycle

`Visitor` (`src/sim/types.ts:...`). State machine in `VisitorState` (`types.ts:110`):

```
Spawned → ToCafeteria → Queueing → Eating → ToLeisure → Leisure → ToDock → (board ship / departed)
```

Service can be skipped depending on archetype.

### Arrival pipeline

1. Every cycle (`CYCLE_DURATION = 15 s`), `scheduleCycleArrivals` (`sim.ts:3548`) tries `controls.shipsPerCycle` arrivals (cap 3, `sim.ts:82`).
2. Pick a lane weighted by `state.laneProfiles[lane].trafficVolume` (`sim.ts:262`–283).
3. Pick a ship type weighted by `laneProfiles[lane].weights[type]`. Type must be `isShipTypeUnlocked` (`sim.ts:348`) — `industrial` requires T2, `military`/`colonist` T3.
4. Pick a size via `preferredShipSize` (`sim.ts:1249`), find an eligible dock (allowedShipTypes ∩ allowedShipSizes ∩ dock area large enough). If none: queue at `state.dockQueue` with `DOCK_QUEUE_MAX_TIME_SEC = 18 s` timeout.
5. `spawnShipAtDock` / `spawnShipAtBerth` creates an `ArrivingShip`. Stages: `approach` (2 s) → `docked` (visitors spawn) → `depart` (2 s).
6. Manifest: `generateShipManifest` (`sim.ts:1376`) blends `SHIP_PROFILES[shipType].manifestBaseline` (`src/sim/content/ships.ts:3`) with the archetype mix.

### Archetypes

`VisitorArchetype` (`types.ts:106`): `diner`, `shopper`, `lounger`, `rusher`. `ARCHETYPE_PROFILES` (`sim.ts:1265`) sets:

- `taxSensitivity` — how much a tax hike bleeds rating.
- `spendMultiplier` — for market spend.
- `patienceMultiplier` — for failure-bail timing.

Patience starts at 0 and increments during failure conditions (no path, queueing too long, etc.).

### Service loop — `updateVisitorLogic`

`sim.ts:5045`:

- **Cafeteria flow.** Walk to ServingStation → wait if no meal at reserved tile → pick up meal → walk to a Table → eat for `visitorEatBaseSec[archetype] + jitter` (`balance.ts:271`). Pays via `mealExitPayout` (`sim.ts:5025`).
- **Leisure.** Market or lounge, picked by `pickVisitorPrimaryPreference`. Market spend = `marketTradeGoodUsePerVisitorPerSec = 0.32 × visitor.spendMultiplier × marketHelperMultiplier` (`balance.ts:250` × `sim.ts:5009`).
- **Trespass.** Stepping into a Restricted-zone tile flips `visitor.trespassed = true` and may spawn a `trespass` IncidentEntity (`sim.ts:5071`–5087); suppression reduced by nearby security aura.
- **Air exposure.** `applyAirExposure` (`sim.ts:1993`):
  - `≥ AIR_DISTRESS_EXPOSURE_SEC = 18 s` → distressed
  - `≥ 38 s` → critical
  - `≥ AIR_DEATH_EXPOSURE_SEC = 62 s` → death (body added)
  - Clinic recovery rate `clinicDistressRecoveryPerSec = 2.4` (`balance.ts:251`).

### Conversion to resident

`maybeConvertVisitorToResident` (`sim.ts:2369`). Eligibility:

- A `private_resident` housing unit exists (`privateHousingUnits` `sim.ts:2269`) — i.e., a Dorm with private hygiene access.
- A residential dock exists.

Base chance is 3% × shipType multiplier × ratingFactor × comfortFactor.

### Render

Visitors are mood-tinted dots (`visitorMoodColor` `render.ts:1271`) or the `agent.visitor.<variant>` sprite. Mood drops with patience and unmet service.

### Tunables

- `controls.shipsPerCycle` — UI slider, top toolbar (cap 3).
- `controls.taxRate` — UI slider, 0–0.5.
- `TASK_TIMINGS.visitorEat*` and `visitorLeisure*` (`balance.ts`).
- `MAX_DINERS_PER_CAF_TILE` = `SERVICE_CAPACITY.tableMaxDiners` (`sim.ts:105` / `balance.ts:240`).

## Residents

### Lifecycle

1. **Spawned** via `maybeConvertVisitorToResident` (`sim.ts:2369`).
2. Bound to a `homeShipId` + `homeDockId` + `bedModuleId`. The home ship's `kind` flips to `resident_home` and stays docked indefinitely (its `depart` stage flips back to `docked` while `residentIds` is non-empty — `sim.ts:3721`).
3. **Departure.** `leaveIntent ≥ RESIDENT_LEAVE_INTENT_TRIGGER = 12` (`sim.ts:152`) flips state to `ToHomeShip`. Reaching the dock fires `unlinkResidentFromShip` and a `RESIDENT_DEPARTURE_RATING_PENALTY = 0.4` (`sim.ts:154`).
4. **Death.** Air-exposure ≥ 62 s — same path as visitors.

`Resident` interface at `types.ts:163`. States in `ResidentState` (`types.ts:146`).

### Needs (`updateResidentLogic` `sim.ts:5877`)

| Need | Decay | Recovery |
|---|---|---|
| hunger | -0.65/s | Eat at Cafeteria |
| energy | -0.50/s | Sleep in Bed |
| hygiene | -0.40/s | Shower / Sink |
| social | decays when alone | gains in Lounge/RecHall/Market/Cafeteria with ≥ 2 nearby agents (`RESIDENT_SOCIAL_RECOVERY_PER_SEC = 2.6`) |
| safety | decays in crowds, near incidents | gains under security aura |

Also tracked: `stress` (built from low needs/safety/social), `satisfaction` (long-running blend, `sim.ts:5969`–5979), `leaveIntent` (climbs when satisfaction `< 18`).

Decay rates are multiplied by air/health penalties.

### Daily routine

`updateResidentRoutinePhase` (`sim.ts:5405`) sweeps through 5 phases over `RESIDENT_ROUTINE_DAY_SEC = 120 s` (`sim.ts:171`):

```
rest → errands → work → socialize → winddown
```

Phase biases the target picker.

### Target picker — `assignResidentTarget`

`sim.ts:5473`. Priority cascade:

1. Leaving (override).
2. Critical-need: dorm.
3. Critical-need: hygiene.
4. Critical-need: cafeteria.
5. Low-safety: secure room.
6. Work-phase: work targets.
7. Socialize-phase: leisure.
8. General rest/hygiene/cafeteria.
9. Idle wander.

### Roles &amp; buffs

`ResidentRole` (`types.ts:161`): `market_helper`, `hydro_assist`, `civic_watch`, `none`.

Picked at conversion via `pickResidentRole` (`sim.ts:2123`) weighted by `RESIDENT_ROLE_WEIGHTS` (`src/sim/content/residents.ts:3`).

Bonuses applied in `updateResources`:

| Role | Effect | Where |
|---|---|---|
| `market_helper` | +16% market spend | `marketHelperMultiplier` `sim.ts:5009` |
| `hydro_assist` | +12% hydro output | `sim.ts:6194`–6196 |
| `civic_watch` | ×1.18 incident suppression | `sim.ts:6313`–6315 |

### Confrontation / fight pipeline

`tryStartResidentConfrontation` (`sim.ts:5615`) checks `residentCanConfront` (agitation ≥ 60, etc.) and rolls `RESIDENT_CONFRONTATION_BASE_CHANCE_PER_SEC = 0.05` against suppression. Fights spawn an Incident of type `fight` tying both residents' `activeIncidentId`. See `08-incidents-effects.md`.

### Tax

`applyResidentTaxes` (`sim.ts:6357`) every `RESIDENT_TAX_PERIOD = 24 s` collects `RESIDENT_TAX_PER_HEAD = 0.42` per resident.

### Render

Green-ringed dots / sprites (`render.ts:1595`).

### Tunables

- `RESIDENT_LEAVE_INTENT_TRIGGER = 12` (`sim.ts:152`)
- `RESIDENT_DEPARTURE_RATING_PENALTY = 0.4` (`sim.ts:154`)
- `RESIDENT_RETENTION_RATING_BONUS_PER_SEC = 0.0009` (`sim.ts:...`)
- `RESIDENT_SOCIAL_RECOVERY_PER_SEC = 2.6`
- `RESIDENT_ROUTINE_DAY_SEC = 120` (`sim.ts:171`)
- `RESIDENT_TAX_PER_HEAD = 0.42`, `RESIDENT_TAX_PERIOD = 24` (`sim.ts:149`–150)
- `RESIDENT_CONFRONTATION_BASE_CHANCE_PER_SEC = 0.05`

## Player framing

Visitors are short-term — credits + rating tick. Failed visits hurt rating per-reason (`addVisitorFailurePenalty` `sim.ts:404`, surfaces in `metrics.stationRatingServiceFailureByReasonPerMin`). Successful visits convert credits + rating bonus.

Residents are long-term — recurring tax income + sustained rating bonus. Each resident persistently consumes air/water/food. They will leave (and tank rating) if their needs aren't met.

The T5 "Health" unlock predicate requires both `actorsTreatedLifetime ≥ 1` and `residentsConvertedLifetime ≥ 1`. Conversion stalls invisibly if no Dorm is set to `private_resident` housing policy with adjacent Hygiene — see trip-wires.

## Trip-wires

- **Resident conversion requires `private_resident` housing** (`sim.ts:2371`). A Dorm with no adjacent Hygiene + the right policy will never convert anyone — the T5 predicate then stalls invisibly with no UI hint.
- Resident home-ships persistently occupy a dock. Don't write code that auto-departs ships with `residentIds.length > 0`.
- Resident `state` and `routinePhase` are independent — the routine biases the target picker but doesn't override critical-need overrides. Don't reorder the priority cascade in `assignResidentTarget` without re-running the resident scenarios in `tools/sim-tests.ts`.
- Visitor patience starts at 0 and *increments* — high patience is bad. Don't invert the sign.
- Berth-bound visitors exit from `RoomType.Berth` tiles, not `TileType.Dock` tiles. Keep visitor departure checks using the shared exit-tile helper rather than checking dock tiles directly.
- `applyAirExposure` is shared between visitors and residents. Changing thresholds affects both populations.
