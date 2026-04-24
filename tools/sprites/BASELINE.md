# Sprite Baseline

This is the working art/technical contract for the station sprite pipeline.
Use it when generating, reviewing, or integrating new sprites.

## Target Read

The game should read as a top-down colony sim with a compact sci-fi station:

- clear Prison Architect-style tile grammar: modular walls, doors, floors, and props
- RimWorld-like top-down readability: silhouettes first, details second
- the richer mockup direction: thick hulls, secondary wall plating, local light accents, and busy but legible rooms

Do not ask image generation to invent topology. Topology belongs in code and
deterministic atlas contracts; generated art should only supply materials,
surface detail, props, and decorative variations.

## Wall System

Walls are the first priority. They use a dual-tilemap grammar:

- render on grid nodes, not just per world cell
- doors count as wall-like for continuity
- six canonical sprites are required:
  - `tile.wall.dt.empty` has 0% opaque pixels
  - `tile.wall.dt.single_corner` has 25% opaque pixels
  - `tile.wall.dt.edge` has 50% opaque pixels
  - `tile.wall.dt.saddle` has 50% opaque pixels
  - `tile.wall.dt.inner_corner` has 75% opaque pixels
  - `tile.wall.dt.full` has 100% opaque pixels
- empty quadrants must be true alpha 0, not magenta, black, or dark filler
- canonical authoring is top-left biased; runtime rotation handles the other orientations

Good wall art should feel like assembled station hull pieces: dark interior
body, light rim highlights only on exposed/concave edges, and subdued panel
texture. Avoid large bevels, heavy perspective, one-off decals, and asymmetry
that breaks when rotated.

## Layers

Think in layers rather than single magic sprites:

- base floor: full-bleed tileable material
- dual wall: deterministic wall geometry
- doors: drawn over wall continuity
- secondary wall/exterior overlays: optional 2x2 decorative plating, pipes, vents, lights
- floor weathering: grime/wear overlays
- local light/glow pass: renderer effect, not baked into every tile

The ChatGPT mockup’s stronger look comes mostly from secondary wall plating,
warm edge lights, and room props. Those should be separate overlays/modules so
agents can iterate without damaging the wall grammar.

## Review Gates

Before accepting wall or floor changes:

```bash
npm run sprites:validate:floors-walls
npm run build
```

For broader sprite changes:

```bash
npm run sprites:verify-floor-periodicity
npm run sprites:validate:v1
```

`sprites:validate:v1` currently still flags unrelated opaque-background
modules, ships, agents, and icons. Do not hide those failures while working on
walls; fix or scope them explicitly.

## Agent Instructions

When assigning sprite work to weaker agents, give them one narrow slice:

- wall topology: only change `tile.wall.dt.*` and run the floors/walls validator
- floor texture: one room/floor family at a time, no icons or per-cell decals
- props/modules: transparent background, centered footprint, no full-frame backplates
- lighting: propose renderer overlays/effects before baking glow into art

Every delivered asset must name its sprite key, source PNG path, atlas profile,
validation command, and whether it is deterministic or generated.
