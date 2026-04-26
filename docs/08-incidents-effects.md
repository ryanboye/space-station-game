# Incidents &amp; Effects

Two unrelated runtime systems for things that "go wrong":

1. **Incidents** — discrete events involving agents (trespass, fight) that flow through a 5-stage pipeline.
2. **Effects** — random short-duration debuffs (cafeteria stall, corridor block, security delay, brownout) triggered when station load is high.

## Incidents

### Types

`IncidentType` (`src/sim/types.ts:...`): `trespass`, `fight`. (Only two — extend by adding to the type union and the pipeline branches.)

### `IncidentEntity` shape

`types.ts:...`:

- `type`, `severity`, `stage`, `tile`, `createdAt`, `resolveBy`
- `responderId` (set after dispatch)
- `subjectIds[]` (visitor on trespass; both residents on fight)
- `outcome` once resolved: `warning`, `deescalated`, `detained`, `fatality`, `escaped`.

### Pipeline — `updateIncidentPipeline`

`sim.ts:5769`. Stages:

```
detected → dispatching → intervening → (intervening_extended for high-severity fights) → resolved | failed
```

Per stage:

- `detected` → 0.25 s grace, then flip to `dispatching`.
- `dispatching` → `pickSecurityResponder` (`sim.ts:1967`) picks the cheapest stationed Security crew by path length + congestion. If no responder by `resolveBy`, `failIncident` (`sim.ts:5735`).
- `intervening` → wait for intervene-time = `INCIDENT_INTERVENTION_BASE_SEC = 0.8` + `path.length * 0.3` + congestion + `securityDelay` × Brig-containment-multiplier (`sim.ts:5786`).
- For fights: `resolveFightOnIntervention` (`sim.ts:5672`). High-severity may go to `intervening_extended` for `FIGHT_EXTENDED_MIN_SEC..MAX_SEC` then resolve.
- `resolveIncident` (`sim.ts:5700`) increments `incidentsResolvedLifetime` (T4 trigger).

### Trespass

Visitors stepping into a Restricted-zone tile may flip `trespassed = true` and spawn a trespass incident (`sim.ts:5071`–5087). Spawn chance reduced by nearby security aura.

### Fight

`tryStartResidentConfrontation` (`sim.ts:5615`) — base chance `RESIDENT_CONFRONTATION_BASE_CHANCE_PER_SEC = 0.05` (`sim.ts:...`) modulated by suppression. Both residents' `activeIncidentId` ties them to the incident.

## Security aura

`computeSecurityAuraMap` (`sim.ts:1931`). Every stationed Security crew (room = Security or Brig, not resting) emits a manhattan-radius aura:

- `SECURITY_AURA_RADIUS = 9` (`sim.ts:...`)
- max value 1.0
- Suppression multiplier `= 1 - aura * (1 - SECURITY_AURA_MAX_SUPPRESSION_FLOOR)` where the floor is `0.35` (`sim.ts:169`).

Fed into:

- Trespass spawn chance.
- Resident agitation rate.
- Confrontation rolls.

### Player framing

- Place Security rooms with Terminal modules, staffed by crew. Aura radiates from each posted Security crew.
- Build a Brig nearby — `brigContainmentMultiplier = 0.76` speeds resolution.
- Restricted zones (paint zone tool) keep visitors out of Reactor/Security areas.
- Failed incidents = bodies + rating drop.
- `civic_watch` resident role buffs incident suppression by 1.18×.

## Heat

`state.incidentHeat` is a per-tick scalar that builds with active incidents and triggers `maybeTriggerFailure`. Decays at 0.08/s (`sim.ts:6552`).

## Effects (random failures)

When `metrics.load / metrics.capacity ≥ 0.9`, `maybeTriggerFailure` (`sim.ts:6371`) rolls each tick. One of four random outcomes:

| Probability | Effect | Duration | What it does |
|---|---|---|---|
| 25% | Cafeteria stall | 3 s | `effects.cafeteriaStallUntil` — eating pauses |
| 30% | Corridor block | 3 s | `effects.blockedUntilByTile[index]` — a random Floor tile becomes impassable |
| 25% | Security delay | 5 s | Doubled if no Security room — slows incident response |
| 20% | Brownout | 4 s | `effects.brownoutUntil` — all movement to 65%, scaled by power deficit |

`Effects` shape at `types.ts:905`.

### Render hooks

- Brownout tint at `render.ts:1682`.
- Blocked-tile red marker at `render.ts:1433`.
- Path skips blocked tiles via `path.ts:131`.

## Tunables

- `SECURITY_AURA_RADIUS = 9`, `SECURITY_AURA_MAX_SUPPRESSION_FLOOR = 0.35` (`sim.ts:169`)
- `INCIDENT_INTERVENTION_BASE_SEC = 0.8`
- `FIGHT_EXTENDED_MIN_SEC` / `MAX_SEC`
- `RESIDENT_CONFRONTATION_BASE_CHANCE_PER_SEC = 0.05`
- `INCIDENT_RESOLVED_RETENTION_SEC` — how long resolved incidents stay in `state.incidents` for UI display
- `effects` durations hardcoded inside `maybeTriggerFailure`

## Trip-wires

- **`incidentsResolvedLifetime` is incremented inside `resolveIncident` — NOT in any metrics scan** (comment at `sim.ts:6626`). The scan-based `incidentsResolved` counter drops as incidents prune past `INCIDENT_RESOLVED_RETENTION_SEC`. Rewriting the metric to track via the scan would break the T4 unlock predicate.
- The four random-failure outcomes are hardcoded probabilities. Adding a fifth means re-balancing the bucket math in `maybeTriggerFailure`.
- A Security crew that's *resting* doesn't emit aura. The aura map only reads on-duty Security.
- Brig multiplier (`brigContainmentMultiplier = 0.76`) only applies if a Brig room exists AND has a Security responder available. Without a Brig the multiplier is 1.0.
- `effects.blockedUntilByTile` is keyed on tile index. After `expandMap`, indices change — `expandMap` remaps these keys (`sim.ts:7553`+) but if you add a new effect that uses a tile-index key you'll need to add it to that remap.
