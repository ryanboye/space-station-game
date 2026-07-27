# Knowledge Index

This directory is a **map of how the game works** — for human contributors and (especially) for future AI agents asked to ship features without grepping the whole repo cold.

## How to use this

If you're an agent picking up a task, read in this order:

1. **`00-overview.md`** — repo map, key concepts (tile/room/module/zone), how a tick flows, how the renderer pulls from sim state.
2. **`23-operational-promise-core-loop.md`** — current product design authority and next playable slice.
3. **`24-two-berth-shift-implementation-goal.md`** — single executable goal for the standalone implementation branch.
4. **`25-crew-sustainability-and-hospitality.md`** — current implementation contract for crew retention and manifest-backed visitor services.
5. **`15-current-roadmap.md`** — roadmap index and status of the older subsystem sequences.
6. **`16/17/18-roadmap-part-*.md`** — paused subsystem plans; use as implementation history and inventory, not an automatic feature sequence.
7. **The system docs** for whatever you're touching (e.g. crew -> `05-crew.md`; walls -> `11-render.md`).
8. **`99-trip-wires.md`** before you commit. Cross-cutting gotchas that will burn you if you didn't know about them.
9. **`37-station-portfolio-program/`** for the current portfolio spine, exact facility recipes, and implementation handoffs.
10. **`38-structural-frontage-visit-flow-implementation-plan.md`** for the physical expansion, frontage, long-visit, crowd-flow, and exposure implementation sequence.
11. **`39-structural-frontage-execution-checklist.md`** for the auditable implementation ledger and playtest acceptance gates.

Every system doc follows the same shape:

- **Player-facing summary** — what is this *in the game*, not just in the code.
- **Code map** — `path:line` references for the key types, functions, and constants.
- **Decision logic** — the rules that drive emergent behavior (priorities, gates, fallbacks).
- **Tunables** — numbers a designer might want to twist.
- **Gotchas** — non-obvious invariants that future-you will trip over.

## File index

| File | Topic |
|---|---|
| `00-overview.md` | Repo map, core concepts, tick flow, state shape |
| `01-simulation.md` | Tick loop, derived caches, scenarios + cold-start |
| `02-build-and-world.md` | Tiles, rooms, modules, zones, expansion, supplies |
| `03-utilities.md` | Pressurization, air, power, water, pathing |
| `04-logistics.md` | Item nodes, transport jobs, resource flow |
| `05-crew.md` | Crew posts, rest, priority presets, hauling |
| `06-visitors-residents.md` | Visitors, residents, conversion, needs, routine |
| `07-docks-ships.md` | Docks, lanes, ship arrivals, queues |
| `08-incidents-effects.md` | Trespass/fight, security aura, random failures |
| `09-progression.md` | Tier unlocks, predicates, lifetime counters |
| `10-economy-rating.md` | Credits, payroll, tax, market, morale, station rating |
| `11-render.md` | Render pipeline, wall systems, glow, sprite atlas |
| `12-ui.md` | `main.ts` DOM driver, hotkeys, URL flags, harness hooks, save/load |
| `13-pipelines.md` | Sprite tools, harness, sim-tests, deployment, CI, repo config |
| `15-current-roadmap.md` | Roadmap index and shared product direction |
| `16-roadmap-part-1-living-actors-jobs.md` | Part 1: reservations, providers, logistics, job board, roles, residents |
| `17-roadmap-part-2-utilities-hazards-sanitation.md` | Part 2: access, districts, utilities, hazards, maintenance, sanitation |
| `18-roadmap-part-3-command-map-contracts.md` | Part 3: command center, system map, contracts, station identity, incidents |
| `22-reputation-property-value-and-security.md` | Reputation, property value, crime pressure, and security plan |
| `23-operational-promise-core-loop.md` | Current core-loop design authority, system disposition, and Two-Berth Shift slice |
| `24-two-berth-shift-implementation-goal.md` | One-shot implementation goal for the standalone Two-Berth Shift branch |
| `25-crew-sustainability-and-hospitality.md` | Crew quarters, morale/retention, and manifest-backed hospitality services |
| `37-station-portfolio-program/` | Current station portfolio design, player-authored opening, and ordered implementation packages |
| `38-structural-frontage-visit-flow-implementation-plan.md` | Structural expansion, physical frontage, approach envelopes, longer visits, crowd flow, and hull exposure plan |
| `39-structural-frontage-execution-checklist.md` | Master checklist for implementation, evidence, migration, performance, and user playtest review |
| `99-trip-wires.md` | Cross-cutting invariants — read before committing |

## Conventions

- Citations use `path:line` (relative to repo root). Click-to-navigate works in most editors.
- "Sim" = `src/sim/`. "Render" = `src/render/`. "UI" = `src/main.ts` (single file, no framework).
- "Tile" is a coordinate `(x,y)` flattened as `index = y * width + x`.
- "Tier" = unlock tier (T0 starter → T6 specialization).
- "Cycle" = the HUD's 15-second cosmetic time slice. Ship traffic now uses jittered arrival checks. **There is no day/night gameplay** — the HUD's "Day N" string is a render-time fiction (`main.ts:1259`).

## Updating these docs

When you ship a change that contradicts a fact here:

1. Update the relevant system doc — keep the citations current.
2. If your change adds a new invariant that will burn future agents, add it to `99-trip-wires.md`.
3. Don't let the docs rot silently. A stale doc is worse than no doc.

These docs are a snapshot. Code is the source of truth — when in doubt, read the code.
