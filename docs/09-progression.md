# Progression — Tiers &amp; Unlocks

A 6-tier system (T0–T6) gating rooms, modules, and ship types. Lifetime monotonic counters trigger advances. Locked content is visible at the build palette but tooltip-only; clicking shows the unlock requirement.

## Tier definitions

`UNLOCK_DEFINITIONS` at `src/sim/content/unlocks.ts:36`. Six tiers (T1 through T6 — T0 is implicit / starting state):

| Tier | Id | Predicate |
|---|---|---|
| 1 | `tier1_sustenance` | `archetypesServedLifetime ≥ 1` |
| 2 | `tier2_commerce` | `creditsEarnedLifetime ≥ 500` AND `archetypesServedLifetime ≥ 3` |
| 3 | `tier3_logistics` | `tradeCyclesCompletedLifetime ≥ 1` |
| 4 | `tier4_governance` | `incidentsResolvedLifetime ≥ 1` |
| 5 | `tier5_health` | `actorsTreatedLifetime ≥ 1` AND `residentsConvertedLifetime ≥ 1` |
| 6 | `tier6_specialization` | predicate `false` (terminal) |

T6 is **only reachable via cold-start scenarios** (`?scenario=t6-trophy`) or save elevation. The predicate is hard-wired `false` (`unlocks.ts:116`).

## What each tier unlocks

`ROOM_UNLOCK_TIER` (`unlocks.ts:128`) and `MODULE_UNLOCK_TIER` (`unlocks.ts:148`) map content → required tier.

For a quick read: see the maps in `unlocks.ts`. Examples: `Workshop` is T2, `Clinic` is T5, `Brig` is T4. Ships: `industrial` T2, `military`/`colonist` T3.

## Lifetime counter sources

These are the inputs to the predicates. Each is a **monotonic** counter on `state.usageTotals.*` (or `state.metrics.*Lifetime`):

| Counter | Where it's incremented |
|---|---|
| `archetypesServedLifetime` | Derived from `usageTotals.archetypesEverSeen` (boolean record per archetype, `sim.ts:6633`–6636). Set in `spawnVisitor` (`sim.ts:2142`). |
| `creditsEarnedLifetime` | Visitor exit pay, market spend, sellMaterials, sellRawFood. Search `creditsEarnedLifetime` in sim.ts. |
| `tradeCyclesCompletedLifetime` | Each tradeGood sold at market. |
| `incidentsResolvedLifetime` | `resolveIncident` (`sim.ts:6626`). **NOT** in any metrics scan — see trip-wires. |
| `actorsTreatedLifetime` | `applyAirExposure` when an actor recovers from non-healthy → healthy (`sim.ts:2021`). Placeholder until medical events are fully implemented. |
| `residentsConvertedLifetime` | `maybeConvertVisitorToResident` (`sim.ts:2414`). |

## Advancement — `updateUnlockProgress`

`sim.ts:360`. Each tick it walks tiers up from the current unlocked tier:

1. For each tier ≥ `currentTier + 1`:
2. If predicate met → record `unlockedAtSec`, set `triggerProgress[tier] = 1`, advance `currentTier`, continue.
3. Otherwise → record `triggerProgress[tier] = 0..1`, stop.

**Multiple tiers can advance in one tick** if multiple predicates flip simultaneously. The tier-flash UI handles back-to-back replacements; tier-skipping is intentional (`sim.ts:368`–377).

## Build-time gates

- `isRoomUnlocked` (`sim.ts:348`)
- `isModuleUnlocked` (`sim.ts:354`)
- `isShipTypeUnlocked` (`sim.ts:356`)

Used by `tryPlaceModule`, `setRoom`, `tryPlaceModule`, `selectRoomTool`/`selectModuleTool` (`main.ts:1147`/1156). All silently fail rather than throw.

## UI — quest bar &amp; legend

- **`renderQuestBar`** (`src/render/progression/quest-bar.ts:122`) — pinned strip showing current tier + next-tier goal + progress %.
- **`applyLegendStates`** + **`attachLegendTooltipHandlers`** (`src/render/progression/wire.ts:59` / 94) — paint `data-progression-state="locked|coming-next-tier|available"` on legend buttons. Locked clicks pop a tooltip (`tooltip.ts:44`).
- **`maybeFireTierFlash`** (`wire.ts:143`) — full-screen modal on advance, **pauses sim during display** via `onShow`/`onDismiss`.
- **`findOwningTier`** + **`computeToolButtonState`** (`button-state.ts:27`) — generic helpers used by both modal and palette.

Player-facing copy: `PROGRESSION_TOOLTIP_COPY` at `src/sim/content/progression-tooltips.ts:27`.

## Player framing

The quest bar tells the player **the one thing they need to do next.** The progression modal (`refreshProgressionModal` `main.ts:1995`) lays out the full roadmap. Locked build buttons are visible but tooltip-only — discoverability over restriction. The unlock flash celebrates the moment.

## Cold-start scenarios

`?scenario=NAME` URL param → `applyColdStartScenario` (`src/sim/cold-start-scenarios.ts:256`). The whitelist:

- `starter` — default empty start.
- `t1-ready` — crew + reactor + life support + cafeteria, ready to push past T1.
- `t5-ready` — full station, ready to push past T5.
- `t6-trophy` — T6-elevated state for the terminal tier (only way to reach T6 outside save elevation).
- `demo-station` — programmatic 10-room demo via `applyDemoStationOverlay` (`cold-start-scenarios.ts:156`).

## Trip-wires

- **T6 predicate is hard-wired `false`** (`unlocks.ts:116`). Don't enable it accidentally; the content team uses `t6-trophy` cold-start to test T6 content.
- **`incidentsResolvedLifetime` is incremented inside `resolveIncident`, NOT in a metrics scan.** If you "improve" the metric to track via the scan, the T4 unlock predicate breaks because resolved incidents prune past `INCIDENT_RESOLVED_RETENTION_SEC`.
- **`actorsTreatedLifetime` is a placeholder** — proxied from "recovered to healthy" transitions in `applyAirExposure`. Adding explicit medical events should NOT replace this without re-routing the T5 predicate.
- **Tier advances may stack in one tick.** Don't write UI that assumes one flash per tick.
- **Save schema v1→v2 used tier-as-source-of-truth migration** (`save.ts:716`–728) — old v1 ids (`tier1_stability`, `tier2_logistics`, `tier3_civic`) are silently dropped. Don't reuse those id strings.
- Resident conversion (T5 prerequisite) requires `private_resident` housing — see `06-visitors-residents.md`. T5 stalls invisibly without it.
