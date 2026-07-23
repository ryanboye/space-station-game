# Site Charter V1 — Implementation Plan

Status: implementation plan, ready to execute. Written 2026-07-23 from a design session plus code research against `ad3d267`.

Authority: subordinate to `docs/23-operational-promise-core-loop.md`. Sequencing-compatible with `docs/28-see-live-rhythm-port-roadmap.md`: this slice adds **no new tick-path systems** and is deliberately structured to avoid conflicts with concurrent work (See/Live/Rhythm stages, the berth-limiting branch, port-ops balancing).

## Feature Summary

At new-game time the player views the procedurally generated star system and **clicks a location to charter their station**. The click derives a `SiteProfile` that parameterizes systems that already exist:

- **Sun proximity** raises the station map's `sunlight` baseline (existing thermal-drift pressure) and later enables solar power. Sunward = hot but energy-rich.
- **Belt/debris proximity** raises the `debris-risk` baseline (existing hull-wear/micrometeor pressure), sets the local resource flavor from the belt's `resourceType`, and densifies the rendered debris backdrop. Beltward = rich but abrasive.
- **Lane proximity** scales traffic volume and ship-type mix through the existing `laneWeightsFromSystem` path.

Design decisions already made:

1. **Charter mostly anywhere.** No dead seeds: every location gets the identical baseline starter station and an ambient traffic floor (break-even by default). Location grants bonuses and pressures, never viability.
2. **One environment model, two scales.** System position sets per-map *baselines*; the existing `map-conditions.ts` noise provides local texture. The survey speaks the same labels the tile inspector already uses (bright sun / heavy debris / thermal sink).
3. **The survey is the contract.** Every number shown at charter time is a live input to a real system. No lore stats.
4. **The backdrop is the survey made permanent.** Sun size/palette, debris density/type, and the nearest planet render from the chartered position.

Explicitly deferred (later slices): faction charter deals, belt `factionClaim` harvest rights, rival stations/competition, harvesting + selling, warfare/ecosystem events, Solar Panel spatial-power gameplay beyond the scalar term.

## Research: Verified Integration Points

These are the load-bearing facts the plan relies on (verified against `ad3d267`):

| Fact | Evidence |
|---|---|
| System map already generates deterministically at state creation | `createInitialState` calls `generateSystemMap(seed)` — `src/sim/initial-state.ts:70` |
| System map is **regenerated from seed on load, not saved** — additive map fields need no save changes | comment at `src/sim/types.ts:1364-1371`; `hydrateStateFromSave` in `src/sim/save.ts` |
| All environmental consumers flow through **one choke point** | `mapConditionAt` in `src/sim/map-conditions.ts:43`; consumers call through it (thermal `sim.ts:6034`, hull debris `sim.ts:8135`, diagnostics `sim.ts:3274+`) — injecting site baselines touches exactly one function |
| Lane ship-type weights are consumed at **one call site** | `laneWeightsFromSystem` used only at `src/sim/sim.ts:945` |
| Power supply is one scalar line — a solar term is a one-line add | `src/sim/sim.ts:19551` |
| `createInitialState` already takes an options object — charter is one more optional field | `src/sim/initial-state.ts:61-66` |
| Backdrop rendering is seeded and localized to one block | `src/render/render.ts:347-490` (`renderHash01(state.seedAtCreation, ...)`, massive planet at `:481`) |
| Belt data already carries `resourceType: 'metal' \| 'ice' \| 'gas'` and (unused) `factionClaim` | `src/sim/system-map.ts:251-259` |
| URL-param startup idiom already exists for opt-in flows | `?scenario=` loader `src/main.ts:1013-1035` |
| Focused-test-runner idiom already exists | `tools/port-ops-tests.ts` + `npm run test:port-ops` pattern, `tsconfig.simtest.json` |

## Conflict-Avoidance Rules

Concurrent work is active in `sim.ts`, `main.ts`, `render.ts`, and `balance.ts`. This plan holds to:

1. **New logic lives in new files.** `site-charter.ts` (sim) and `charter-screen.ts` (UI) own everything they can.
2. **Edits to shared files are single-block, append-biased, and anchored.** `types.ts` additions go at the end of the file. `main.ts` gets one hook in the existing URL-param section. `render.ts` edits stay inside the backdrop block (`:347-490`).
3. **`sim.ts` is not edited at all in PRs 1-3.** The only `sim.ts` edits in the whole slice are PR 4's one-line power term and the one-call-site lane-weight modifier.
4. **Everything is opt-in until the flip.** The charter screen mounts only under `?charter=1`. Default startup is byte-for-byte unchanged until a final one-line flip PR, scheduled after concurrent branches merge.
5. **All new state fields are optional** (`state.site?:`), with absent = current behavior, so old saves and every existing test/scenario/harness fixture pass untouched.

## Data Contract

Append to `src/sim/types.ts` (end of file):

```ts
/** Chartered system position and its derived environmental baselines.
 *  Absent on legacy saves and un-chartered starts: all systems must
 *  treat undefined as "current default behavior". */
export interface SiteCharter {
  version: 1;
  /** Normalized system-map position, 0..1 disc coordinates. */
  x: number;
  y: number;
  /** Derived once at charter time from system geometry. All 0..1. */
  sunFactor: number;      // raises map-condition 'sunlight' baseline
  debrisFactor: number;   // raises map-condition 'debris-risk' baseline
  resourceType: 'metal' | 'ice' | 'gas' | null; // nearest belt flavor
  /** Per-lane traffic multipliers, 1 = current default volume. */
  laneTrafficFactor: Record<SpaceLane, number>;
}
```

`StationState` gains one optional field: `site?: SiteCharter`.

`SystemMap` gains additive optional fields (regenerated, never saved):

```ts
export interface LaneRoute {
  id: string;
  from: string; // planet id or 'gate-N'
  to: string;
  volume: number; // 0..1
  points: Array<{ x: number; y: number }>; // polyline, disc coords
}
// SystemMap: laneRoutes?: LaneRoute[];
```

Derivation lives in the new module, pure and deterministic:

```
computeSiteProfile(system: SystemMap, x: number, y: number): SiteCharter
```

- `sunFactor`: 1 − radial distance from system center, shaped.
- `debrisFactor` + `resourceType`: proximity to the nearest belt annulus (`innerRadius`/`outerRadius` already geometric).
- `laneTrafficFactor`: per compass lane, scaled by distance to the nearest `LaneRoute` polyline serving that edge, clamped to a floor (ambient traffic — the viability guarantee) and a ceiling (≈2.5x).

## PR Plan

### PR 1 — Map geometry + site math (no behavior change)

New file `src/sim/site-charter.ts`; edits to `src/sim/system-map.ts` (additive generation of `laneRoutes` from planet pairs + 2 system gates, volume from endpoint faction economies) and `src/sim/types.ts` (append the contract above).

- `generateSystemMap` output gains `laneRoutes`; existing `laneSectors` and all current consumers untouched.
- `computeSiteProfile` implemented with unit anchors: center → high sun, belt annulus → high debris + correct resourceType, near-route → high lane factor, far corner → floors only.
- New focused runner `tools/site-charter-tests.ts` + `npm run test:site-charter` (mirror the port-ops runner; one `package.json` script line). Tests: determinism (same seed+click → identical profile), floor guarantee (no position yields all-floors-zero), belt flavor correctness.

Verification: `npm run build`, new focused runner, `npm run test:port-ops` unchanged.

### PR 2 — Charter screen behind `?charter=1`

New file `src/ui/charter-screen.ts` — a self-contained full-screen overlay (own canvas + DOM, own styles injected or a scoped block appended to `styles.css`) that renders the system map (planets, belts, lane routes, sun), tracks the cursor as a **survey probe** (live panel: sun band label, resource band label, traffic estimate — using the existing `map-conditions` label vocabulary), and resolves a click to `computeSiteProfile`.

Edits:

- `src/sim/initial-state.ts`: `options.charter?: SiteCharter` → `state.site = options.charter` (2 lines, inside the existing options destructure).
- `src/main.ts`: one hook (~8 lines) in the URL-param section adjacent to the `?scenario=` loader (`:1013-1035`): if `?charter=1` and no `?load`, mount the charter screen before game init; on confirm, pass the charter into state creation. No other `main.ts` edits.
- `src/sim/save.ts`: persist/restore `state.site` (optional field; absent = legacy). Follow the existing optional-field pattern rather than bumping the schema if the current loader tolerates additive fields; bump only if it does not.

Verification: default startup (`/`, `?scenario=starter`) byte-identical behavior; `?charter=1` flow produces a state whose `site` survives save/load; both focused runners pass.

### PR 3 — Environmental baselines + backdrop

Edits:

- `src/sim/map-conditions.ts` (~12 lines in `mapConditionAt`): blend `state.site` baselines — e.g. for `'sunlight'`: `mix(noiseValue, 1, site.sunFactor * WEIGHT)`; for `'debris-risk'`: same with `debrisFactor`. Absent `site` → exact current output (guard first, return early into existing code path). This single edit propagates to thermal drift, hull wear, exterior maintenance, overlays, and inspector labels with **zero further sim changes**.
- `src/render/render.ts` (inside `:347-490` only): backdrop reads optional `state.site` — sun disc size/warmth from `sunFactor`, debris parallax density from `debrisFactor`, debris palette from `resourceType` (rock grey / ice blue-white / gas amber), massive-planet sprite chosen from the nearest system-map planet's `bodyType`. Absent `site` → current seeded behavior.

Verification: in-browser A/B — charter sunward, confirm hotter thermal overlay + bigger warmer sun; charter beltward, confirm denser debris + measurably faster exterior maintenance-debt accrual (existing systems doing the work). Focused runners + `npm run build`.

### PR 4 — Traffic modulation + the two gameplay knobs

Edits (the only `sim.ts` touches in the slice):

- `src/sim/sim.ts:945`: multiply normalized lane weights' effective volume by `state.site?.laneTrafficFactor[lane] ?? 1` (one expression at the single call site; alternatively an additive wrapper exported from `system-map.ts`).
- `src/sim/sim.ts:19551` area: `+ solarSupply` where `solarSupply = solarPanelsActive * POWER_PER_SOLAR * avgSunlightAtPanels`. **Requires the Solar Panel module**, which is the widest-touch item of the slice (enum in `types.ts`, `MODULE_DEFINITIONS` in `balance.ts`, sprite key + `sprite-spec.yaml` art, build-palette entry in `main.ts`, ops count following the `reactorsActive` pattern at `sim.ts:7935`). If concurrent-branch pressure on `balance.ts`/`main.ts` is high at execution time, split Solar Panel into its own follow-up PR and ship PR 4 as traffic-only.
- Optional third knob (one line, same PR or dropped): scale life-support power draw by `1 + COLD_WEIGHT * (1 - sunFactor)` so the outer system asks for power the way the inner system asks for vents.

Verification: focused traffic test (charter near/far from a route lane → offer cadence differs measurably); solar test (panels on bright-sun tiles raise supply, deep-shade panels near zero); browser session per charter archetype (sunfarm / belt / quiet corner) recorded in the playtest-log format from `docs/24`.

### PR 5 — Default flip (scheduled last, after concurrent branches merge)

One-line change: new game without `?load`/`?scenario` opens the charter screen, with a prominent **"Recommended charter"** button that applies the current authored default site (preserving the tuned Two-Berth opening exactly). `?charter=0` opt-out retained for harness determinism; harness/scenario fixtures explicitly pass a fixed charter.

## File-Touch Budget (summary)

| File | PRs | Nature |
|---|---|---|
| `src/sim/site-charter.ts` | 1 | **new** |
| `src/ui/charter-screen.ts` | 2 | **new** |
| `tools/site-charter-tests.ts` | 1 | **new** |
| `src/sim/system-map.ts` | 1 | additive generation block |
| `src/sim/types.ts` | 1 | append-only |
| `src/sim/initial-state.ts` | 2 | 2 lines |
| `src/sim/save.ts` | 2 | optional field |
| `src/main.ts` | 2, (4), 5 | one hook in URL-param section; palette entry only if Solar lands |
| `src/sim/map-conditions.ts` | 3 | ~12 lines, one function |
| `src/render/render.ts` | 3 | inside backdrop block only |
| `src/sim/sim.ts` | 4 | two one-line edits at verified anchors |
| `src/sim/balance.ts` | (4) | Solar Panel def only |
| `package.json` | 1 | one script line |

## Non-Goals For This Slice

- No harvesting, selling, or resource nodes (slice 2; see conversation notes — retail reuses the meal grammar, bulk export reuses `freight-loaded`).
- No rival stations or competition modifiers.
- No faction charter deals or `factionClaim` rights (the field stays dormant one more slice).
- No spatial power grid — solar is a scalar term.
- No ecosystem events, warfare, or dynamic prices.
- No free-text system-map lore. Every displayed value must trace to a `SiteCharter` field consumed by a live system.

## Open Questions

1. Should the survey show absolute numbers ("~3 arrivals/min") or comparative bands ("busier than most sites")? Recommendation: bands in v1 — honest without promising precision the forecast can't keep.
2. Charter screen art budget: vector-only v1 (reuse backdrop drawing helpers) vs. sprite work? Recommendation: vector v1; the system map earns sprites when it becomes a live surface (slice 3+).
3. Does `laneTrafficFactor`'s ambient floor need tuning against the berth-limiting branch's early-game economy? Coordinate before PR 4 lands.
