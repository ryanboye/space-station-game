# Pipelines — Sprites, Harness, Sim Tests, Deploy

Everything outside `src/`. Most of it lives under `tools/`.

## Sprite pipeline

Lives entirely in `tools/sprites/`. Three roles tracked separately on disk:

- `tools/sprites/curated/` — source-of-truth art, **checked into git**.
- `tools/sprites/out/raw/` and `tools/sprites/out/raw-pixellab/` — disposable AI output.
- `tools/sprites/out/processed/` — generated/normalized intermediate (gitignored).
- `public/assets/sprites/atlas.{png,json}` — the runtime build artifact.

`pack-atlas.mjs` always prefers `curated/` and falls back to `processed/` only if a curated PNG is missing (`tools/sprites/pack-atlas.mjs:137`–150).

### Source of truth

- **`tools/sprites/sprite-spec.yaml`** — per-key prompt + optional `rotation` (0/90/180/270) + optional `frameWidth/frameHeight/offsetX/offsetY/blendMode/alpha`. ~123 entries.
- **`tools/sprites/sprite-spec.mjs`** — loader (`loadSpriteSpec`, `getSpriteRotation`, etc.).
- **`tools/sprites/prompt-macros.yaml`** — reusable `{MACRO}` tokens for camera/palette vocabulary. Expanded by `build-gen-prompt.mjs`.

### Profiles

Atlas builds are profile-keyed. Each profile is a JSON file listing required atlas keys:

| Profile | File | Scope |
|---|---|---|
| `v1` | `tools/sprites/required-keys-v1.json` | Full atlas (~102 keys) — **the runtime profile**. |
| `floors-walls` | `required-keys-floors-walls.json` | 14 keys — base floor + classic 8 wall variants + 6 dual-tilemap. |
| `agents` | `required-keys-agents.json` | 18 keys — visitor/resident/crew × 6. |
| `tiles-full` | `required-keys-tiles-full.json` | 24 keys — all `tile.*`. |
| `test` | `required-keys-test.json` | 15-key smoke set. |

`pack-atlas.mjs` writes `atlas.{png,json}` for `v1`, `atlas-<profile>.{png,json}` for the others. The `--activate` flag rewrites `atlas.{png,json}` to point at a non-v1 profile (used to swap floor/wall art independently while iterating).

### Phases

#### Generation

**Note: the actual generator scripts (`generate-nanobanana.mjs`, `generate-gpt-image.mjs`, `qa-review.mjs`) referenced by `retry-sprites.mjs` and the `sprites:generate:*` npm scripts are NOT in the tree.** They were ripped out in PR #36. The README still references them. The helpers below remain:

- `build-prompt.mjs` — `buildPrompt(spec, key)` wraps per-key prompts with envelope + `rephrasePrompt`.
- `build-gen-prompt.mjs` — CLI; expands `{MACRO}` tokens. npm: `sprites:build-prompt`.
- `moderation-rephrase.mjs` — hard-coded swap dict (`security`→`patrol personnel`, etc.) for OpenAI moderation 400 avoidance.
- `rate-limits.mjs` — gpt-image-2 tier table, `estimateDuration`, `estimateCostUsd`, `classify429Bucket`, `parseRetryAfter`, `backoffMs`.
- `retry-sprites.mjs` — orchestrator (currently broken — depends on missing `generate-nanobanana.mjs`).

#### Postprocess

- `postprocess-raw.mjs` — main postprocess. Args: `--profile`, `--overwrite`, `--variant {nano-banana|pixellab}`. Reads `out/raw/`, writes `out/processed/`. Per-key flood-fill background removal + crop + resize + edge-harmonize. Threshold env vars at the top of the file.
- `cleanup-module-backgrounds.mjs` — operates on `curated/` directly. Quantized border-mode color detection + flood-fill, with per-key tolerance overrides.
- `cleanup-object-backgrounds.mjs` — same algorithm for ships/agents/icons. Has `clearGuideMarks` (kills magenta/cyan guide pixels) and `keepLargestAlphaComponent` for `agent.*` keys.
- `normalize-module-footprints.mjs` — re-fits curated module sprites to their `FOOTPRINT × 64` frame.
- `stylize-save-scene.mjs` — Gemini call for save-scene asset pipeline (separate from atlas builds).

#### Pack &amp; validate

- `pack-atlas.mjs` — packs profile keys into PNG + JSON manifest. Args: `--profile`, `--source {auto|curated|processed}`, `--activate`, `--variant`, `--spec`. Handles `OVERLAY_FOOTPRINT_BY_KEY` (2×2 dock facades, 1×1 grime/wear, 2×2 wall exteriors). Pads each frame with edge-clamp via `buildPaddedSprite`. Env: `SPRITE_ATLAS_CELL_SIZE` (64), `SPRITE_SPACE_ATLAS_SIZE` (256), `SPRITE_ATLAS_PADDING` (2), `SPRITE_ATLAS_MAX_WIDTH` (3072).
- `validate-atlas.mjs` — checks the packed atlas against per-key thresholds. Dual-wall keys check coverage (0/25/50/50/75/100%); surface keys check bright-edge / transparent-edge / seam thresholds; transparent tile-objects (doors) treated as non-tile.
- `verify-golden.mjs` — pre-pack regression gate. Compares each `curated/<key>.png` against `golden/<key>.png` on three axes: pixel-RMS-per-channel, HSV palette histogram L1 distance, binarized alpha silhouette IoU. Allowlist via `accepted-diffs.json`.
- `verify-floor-periodicity.mjs` — pre-pack tile-periodicity gate. Tiles each `room.*` 8×8 and computes luminance autocorrelation; threshold 0.55.
- `archive-atlas.mjs` — post-pack hook. Snapshots `atlas.{png,json}` + `curated/` into `archive/`. Prunes to last 10 entries. Auto-invoked by `sprites:pack`.

#### Import / export workflows

For human-in-the-loop edits — exporting curated art to a sheet, painting in an external editor, importing back.

- **Atlas worksheet (legacy):** `export-atlas-worksheet.mjs`, `import-atlas-worksheet.mjs`, `migrate-old-worksheet.mjs`.
- **Edit sheet (current canonical):** `export-edit-sheet.mjs`, `import-edit-sheet.mjs`. Args: `--profile`, `--single KEY`, `--scale`. Writes `tools/sprites/edit/<profile>/<profile>-edit.png`.
- **Save scene:** `export-save-scene.mjs`, `crop-save-scene.mjs`, `export-save-crop-guide.mjs`, `stylize-save-scene.mjs`.
- **Atlas guide / unpack:** `export-atlas-guide.mjs`, `unpack-atlas-sheet.mjs` (slice externally-authored atlas PNGs into curated/ — workflow described in file header).
- **`bootstrap-curated.mjs`** — one-shot. Copies every PNG from `out/processed/` into `curated/`.

#### Dual-tilemap stubs

`tools/sprites/dual-tilemap-stubs/` — placeholder programmatic art for the 6-key dual-tilemap wall system. Used until hand-authored versions land.

- `generate-stubs.mjs` — emits 5 deterministic 64×64 PNGs. Hardcoded palette: body `#2a3040`, body-dark `#202533`, body-light `#374054`, rim `#d8e0ea`. Authoring is TL-biased (matches `pickDualVariant`'s canonical lookup).
- `promote-stubs.mjs` — copies the 5 staged stubs into `tools/sprites/curated/`; programmatically derives `tile.wall.dt.inner_corner` from `wall_dual_full.png` by clearing the bottom-right quadrant.

### Canonical npm pipelines

From `package.json`:

```
sprites:build:v1                      [BROKEN — depends on missing generate scripts]
  → sprites:generate:v1               (missing)
  → sprites:process                   = postprocess-raw.mjs --profile v1 --overwrite
  → pack-atlas.mjs --profile v1 --source processed
  → sprites:validate:v1               = validate-atlas.mjs --profile v1

sprites:pack                          [WORKS — pack from curated, no regen]
  → verify-golden.mjs                 (regression gate)
  → verify-floor-periodicity.mjs      (no-grid-icon gate)
  → pack-atlas.mjs --profile v1
  → archive-atlas.mjs                 (post-pack snapshot)

sprites:edit:apply:tiles:activate     [WORKS — apply edit sheet + activate runtime]
  → sprites:edit:import:tiles         = import-edit-sheet.mjs --profile tiles-full
  → pack-atlas.mjs --profile v1 --activate
  → sprites:validate:v1
```

### Discrepancies to know about

1. The `sprites:generate:*`, `sprites:regenerate:*`, `sprites:retry:*` scripts referenced in `tools/sprites/README.md:99`–101 are missing from `package.json`. The corresponding `.mjs` files were ripped out in PR #36.
2. `.gitignore:11`–12 claims raws are tracked as a skip-cache for `generate-nanobanana.mjs`. With that script gone, this comment is stale.
3. `tools/sprites/README.md` references absolute paths from a previous machine (`/Users/ryan.boye/...`). Read all path snippets as relative-to-repo-root.
4. `sprite-spec.yaml` has at least one rotation `-90` (e.g. `tile.wall.corner`); `sprite-spec.mjs:15` `normalizeRotation` only allows 90/180/270 (after rounding-to-nearest-90 modulo 360). `-90` normalizes to `270`.

## Visual regression harness

Lives in `tools/harness/`. Entry: Playwright (`@playwright/test ^1.44.0`).

### Layout

- `tools/harness/scenarios/` — three `*.spec.ts`:
  - `agent-movement.spec.ts` — captures crew/visitor/resident positions, advances 30 sim-seconds, asserts at least one agent in each populated cohort moved.
  - `stable-20min.spec.ts` — three tests: load + harness-ready, advance 1200 sim-seconds in 60s chunks, save export → reload via localStorage round-trip.
  - `ui-smoke.spec.ts` — clicks every top-bar button, asserts zero pageerrors.
- `tools/harness/baselines/` — only `.gitkeep`. Reserved for future screenshot baselines.
- `tools/harness/fixtures/` — only `.gitkeep`. The `stable-20min` save round-trip writes `stable-30s-run.save.json` here as a side effect.

### Required runtime hooks

The scenarios depend on the `__harness*` window symbols documented in `12-ui.md`. They're set up by `src/main.ts:4260`+.

### Config — `playwright.config.ts`

- `testDir: ./tools/harness/scenarios`
- `timeout: 120_000`, `retries: 0`, `workers: 1`
- `baseURL: process.env.HARNESS_BASE_URL || 'http://localhost:5173'`
- `headless: true`, viewport 1280×900
- Reporter writes `summary.json` to `/tmp/harness-runs/latest/summary.json`
- Auto-starts `npm run dev -- --port 5173` unless `HARNESS_SKIP_SERVER=1`

Note dev server's default port is **5174** (`vite.config.ts`); harness uses 5173 to avoid collision with a running dev server.

### Run commands

- `npm run test:harness` — `playwright test`. Spins up dev server if `HARNESS_SKIP_SERVER` is unset.
- `npm run test:harness:update-snapshots` — `playwright test --update-snapshots`. Currently no scenario uses `toHaveScreenshot()` — placeholder for v1.1.

### CI integration

`.github/workflows/harness.yml` — runs harness on every PR but **advisory-only** (`continue-on-error: true`; separate job always reports green). Builds the app, then `npx serve dist -l 5173` + `HARNESS_SKIP_SERVER=1`. Posts a PR comment with pass/fail counts. Uploads `/tmp/harness-runs/latest/` as artifact (30-day retention). Header note: "Promote to blocking after one stable week."

## Sim tests

Two TypeScript files at the `tools/` root:

### `tools/sim-tests.ts` (3057 lines, 117 KB)

Hand-rolled framework — single `run()` function (line 2977) that calls every `testFoo()` in order. Each test uses `assertCondition(cond, msg)` (line 54). Failures throw and abort. End of `run()` prints `sim-tests: PASS` (line 3055).

Coverage: ~80 named tests across unlock progression, ship arrivals, dock topology, room activation, food/material chains, save/load round-trip + migration, agent inspectors, dual-wall variant truth tables.

**Adding a test:** write `function testFooBar(): void` and add a single line in `run()`. Tests are explicit, not auto-discovered.

Tests share `setupState`/`buildHabitat` helpers and call `runFor(state, seconds, step=0.25)` to advance ticks deterministically.

### `tools/sim-perf.ts` (67 lines)

Three benchmarks (`base 60x40`, `expanded 60x80 south`, `expanded 100x80 south+east`); each runs 240 warmup ticks then measures avg ms/tick over 1200 ticks. Asserts the slope between successive map sizes is ≤ 1.80× to catch quadratic growth.

### How they run

```
test:sim
  → tsc -p tsconfig.simtest.json         # compile to .tmp/sim-tests/
  → node tools/write-simtest-package.cjs # write .tmp/sim-tests/package.json {"type":"commonjs"}
  → node .tmp/sim-tests/tools/sim-tests.js
```

**Why `write-simtest-package.cjs`?** `tsconfig.simtest.json` compiles to `module: CommonJS` but the repo's `package.json` declares `"type": "module"`, so Node resolves `.tmp/sim-tests/**/*.js` as ESM by default. The 5-line helper writes a sub-`package.json` with `{"type":"commonjs"}` to flip the package boundary.

### CI

`.github/workflows/ci.yml` runs `npm run test:sim` after `npm run build`. Sprite-atlas validation is wrapped in `continue-on-error: true` (advisory).

## Deployment

Two parallel paths:

### A. Production — GitHub Pages

`.github/workflows/deploy-pages.yml`:

- Triggers: push to `main`, `workflow_dispatch`.
- Job 1: checkout → setup-node@v4 (Node 20) → `npm ci` → `npm run build` → upload `dist/` as Pages artifact.
- Job 2: `actions/deploy-pages@v4`.
- URL pattern: `https://ryanboye.github.io/space-station-game/`.

### B. Dev mirror — BMO server, systemd timer

Pull-based, every 5 min from the BMO server. Lives in `tools/deploy/`.

- **`build.sh`** — Reads `SPACEGAME_REPO`, `SPACEGAME_WEBROOT`, `SPACEGAME_BRANCH`, `SPACEGAME_REMOTE`. Steps: `git fetch --prune` → if `LOCAL == UPSTREAM` and webroot non-empty, exit 0 → else `git reset --hard $UPSTREAM` → `npm ci` → `npm run build` → `rsync -a --delete --checksum dist/ $WEBROOT/`. Force-builds on empty webroot.
- **`spacegame-deploy.service`** — systemd oneshot, user `spacegame`, timeout 300s. Defaults `SPACEGAME_REPO=/opt/spacegame-repo`, `SPACEGAME_WEBROOT=/var/www/spacegame`.
- **`spacegame-deploy.timer`** — `OnBootSec=2min`, `OnUnitActiveSec=5min`, `Persistent=true`.
- **`Caddyfile.snippet`** — `handle_path /spacegame/* {…}` route. Long-cache `/assets/*`, short-cache `/index.html`.
- **`README.md`** — operational runbook.

URL: `https://bmo.ryanboye.com/spacegame/`.

The two flows are independent. GH Pages is the immutable release channel; the BMO mirror is the dev loop, ~5 min behind `main`.

## Repo configuration

### TypeScript configs

| Config | For |
|---|---|
| `tsconfig.json` | App build. `target: ES2020`, `module: ESNext`, `noEmit: true`, `strict: true`. Includes `src/`. |
| `tsconfig.node.json` | Vite config itself. `composite: true`, includes `vite.config.ts`. |
| `tsconfig.simtest.json` | Sim tests. `module: CommonJS`, `outDir: .tmp/sim-tests`, includes `src/sim/**` + `tools/*.ts`. CommonJS output is what makes `write-simtest-package.cjs` necessary. |

### Vite config — `vite.config.ts`

- `base: './'` — relative paths so deploys work under any prefix (`/spacegame/` on the BMO server).
- `server.port: 5174`, `strictPort: true`.
- Multi-entry rollup: `main: index.html`, `progressionDemo: progression-demo.html`. Without this, the standalone progression demo would have unresolved script paths.

### Workflows — `.github/workflows/`

| Workflow | Triggers | What it does |
|---|---|---|
| `ci.yml` | PR → main, push → main | `npm ci` → advisory sprite-atlas validation → `npm run build` → `npm run test:sim`. |
| `deploy-pages.yml` | Push → main, dispatch | Build + upload Pages artifact + deploy. |
| `harness.yml` | PR → main | **Advisory-only.** Build + serve + harness + PR comment + 30-day artifact upload. |

### Env vars

`.env.example` documents Gemini settings (`GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`). Other env vars (in scripts but not `.env.example`):

- Atlas sizing: `SPRITE_ATLAS_CELL_SIZE`, `SPRITE_SPACE_ATLAS_SIZE`, `SPRITE_ATLAS_MAX_WIDTH`, `SPRITE_ATLAS_PADDING`.
- Postprocess thresholds: `SPRITE_PROCESS_TARGET_SIZE`, `SPRITE_PROCESS_MIN_ALPHA`, `SPRITE_TILE_*`, `SPRITE_NON_TILE_*`.
- Harness: `HARNESS_BASE_URL`, `HARNESS_SKIP_SERVER`, `HARNESS_RUN_DIR`.
- Deploy: `SPACEGAME_REPO`, `SPACEGAME_WEBROOT`, `SPACEGAME_BRANCH`, `SPACEGAME_REMOTE`, `FORCE`.

### `.gitignore` notes

- `node_modules/`, `dist/`, `.tmp` — standard.
- `tools/sprites/out/processed/` and `out/processed-pixellab/` — postprocess output is generated.
- Raws under `out/raw/` are **tracked**.
- `.env*` except `!.env.example`.
- `test-results/`, `playwright-report/`, `/tmp/harness-runs/` — Playwright + harness runtime output.

### devDependencies

`@google/genai`, `@playwright/test`, `dotenv`, `sharp`, `typescript`, `vite`, `yaml`. **No production deps** — the game ships as a static build.

## Trip-wires

- **`sprites:generate:*` and `sprites:retry:*` are broken** — the `.mjs` generators were removed in PR #36. The README still references them. If you need to re-run generation, you'll need to re-add (or replace) those scripts.
- **`pack-atlas.mjs --activate` cannot be used with `--variant pixellab`** — would overwrite the primary atlas. Refused at the script level.
- **`verify-floor-periodicity.mjs` exempts every `room.*` via `accepted-diffs.json` `.periodicity[]`** while the seamless-tile pass is in flight. Removing those entries before the seamless tiles land breaks the gate.
- **Harness `workers: 1`** — scenarios share side effects (e.g. localStorage). Don't parallelize without rewriting the test isolation.
- **Sim tests require `--type=commonjs` in the compiled output dir** — never delete `tools/write-simtest-package.cjs`.
- **Sim tests are explicit-listed in `run()`.** Adding a test file but forgetting to add it to `run()` is a silent failure.
- **GH Pages deploys on every push to main.** There's no PR preview deploy. The BMO mirror is the closest thing to a preview, and it's behind by up to 5 minutes.
