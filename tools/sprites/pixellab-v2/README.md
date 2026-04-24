# Pixellab v2 asset-gen driver

Generates sprite variants for space-station-game via the [Pixellab v2 API](https://api.pixellab.ai/v2/llms.txt).
Writes one subdir per `{category}/{asset}/` with four-direction PNGs + a stitched
horizontal sheet per variant. A top-level `_status.json` manifest is BMO's
tile-gallery consumption point.

## Run

```bash
PIXELLAB_API_KEY=... node gen.mjs
```

Output:
- `agents/{name}/{variant}_{north,east,south,west}.png` — per-direction tiles
- `agents/{name}/{variant}.png` — 4-wide composite sheet
- `_status.json` — categories → assets → variants list

## Round 1 (this commit)

3 agents × 2 variants + 6 modules × 2 variants = 18 sprites @ $0.0567 total.

- agents: `crew_engineer`, `visitor_diner`, `resident_sleeper`
- modules: `bed`, `table`, `terminal`, `stove`, `workbench`, `couch`
- variants: `v1` (base) + `highdetail`

Pipeline published live at `https://claw.bitvox.me/spacegame-assets/_status.json`
for BMO's tile-gallery (`https://bmo.ryanboye.com/tile-gallery/`).

## Not included in repo

The generated PNGs are served from the box but not committed — re-run `gen.mjs`
to regenerate, or read from the live URL above. Pixellab v2 is deterministic by
`seed`; omit seed for variety or set it in `MANIFEST` for stable re-runs.
