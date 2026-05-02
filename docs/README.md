# Knowledge Index

This directory is a **map of how the game works** — for human contributors and (especially) for future AI agents asked to ship features without grepping the whole repo cold.

## How to use this

If you're an agent picking up a task, read in this order:

1. **`00-overview.md`** — repo map, key concepts (tile/room/module/zone), how a tick flows, how the renderer pulls from sim state.
2. **`15-current-roadmap.md`** — current product direction, what is done, what is partial, and what should be assigned next.
3. **`20-station-layout-project-plans.md`** and **`21-agent-handoff-layout-sim.md`** if you are doing feature work from the current simulation/layout push.
4. **`22-simulation-next-phases.md`** if you are changing jobs, needs, logistics, utilities, station identity, or agent behavior.
5. **The system docs** for whatever you're touching (e.g. crew → `05-crew.md`; walls → `11-render.md`).
6. **`99-trip-wires.md`** before you commit. Cross-cutting gotchas that will burn you if you didn't know about them.

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
| `02-build-and-world.md` | Tiles, rooms, modules, zones, expansion, materials |
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
| `15-current-roadmap.md` | Live product roadmap, MVP target, next work, swarm guidance |
| `20-station-layout-project-plans.md` | Handoff specs for berth approach, route intent, utilities, expanded needs, compartments, and adjacency |
| `21-agent-handoff-layout-sim.md` | Current handoff notes for the active layout/simulation push |
| `22-simulation-next-phases.md` | Research-backed next phases for job assignment, living agents, logistics, utilities, sanitation, and system-map contracts |
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
