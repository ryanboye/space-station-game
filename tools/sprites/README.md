# Sprite Tooling (Nano Banana)

## 0) Asset source-of-truth

The pipeline now has two separate roles:

- `/Users/ryan.boye/Documents/New project/tools/sprites/curated` = source-of-truth art you want to keep
- `/Users/ryan.boye/Documents/New project/tools/sprites/out/raw` = disposable AI output
- `/Users/ryan.boye/Documents/New project/tools/sprites/out/processed` = generated/normalized draft output
- `/Users/ryan.boye/Documents/New project/public/assets/sprites/atlas.png` + `.json` = build artifacts only

Normal atlas packing prefers `curated` first and falls back to `processed` only if a curated file is missing.

Seed `curated` once from the current processed baseline:

```bash
npm run sprites:curated:bootstrap
```

## 1) Local API key setup

Create `/Users/ryan.boye/Documents/New project/.env.local`:

```bash
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

`.env.local` is git-ignored, so keys stay local and are not pushed.

## 2) Single prompt/rotation source of truth

Edit `/Users/ryan.boye/Documents/New project/tools/sprites/sprite-spec.yaml`.

Each sprite key has:

- `prompt`: text prompt used for generation.
- `rotation`: optional clockwise correction in `0`, `90`, `180`, `270` (applied at runtime via atlas manifest).

Example:

```yaml
sprites:
  tile.wall.corner:
    prompt: Top-down pixel art wall corner tile, full-bleed, no border.
    rotation: 90
```

## 3) Full profile builds

All-in-one full profile from generated drafts (`processed` source):

```bash
npm run sprites:build:v1
```

Floors/walls-only profile from generated drafts:

```bash
npm run sprites:build:floors-walls
```

Activate floors/walls atlas as runtime default (`atlas.json`):

```bash
npm run sprites:build:floors-walls:activate
```

Agents/people profile from generated drafts:

```bash
npm run sprites:build:agents
```

## 4) Retry only specific sprites (no full regeneration)

Use retry scripts with `--keys` (comma-separated). This regenerates only those keys into draft assets and packs from `processed`, without touching curated art.

Retry two floors/walls keys:

```bash
npm run sprites:retry:floors-walls -- --keys tile.floor,tile.wall.corner
```

Retry one v1 key:

```bash
npm run sprites:retry:v1 -- --keys module.bed
```

Retry and activate floors/walls atlas in one command:

```bash
npm run sprites:retry:floors-walls:activate -- --keys tile.floor,tile.wall.straight
```

Notes:

- `sprites:generate:*` only fills missing raws.
- `sprites:regenerate:*` forces all keys in that profile.
- `sprites:retry:*` forces only requested keys.

## 5) Optional generation/style controls

Override style text for a run:

```bash
SPRITE_STYLE_GUIDE="top-down colony sim, muted palette, hard-edged forms" npm run sprites:generate:floors-walls
```

Optional style reference image:

```bash
SPRITE_STYLE_REFERENCE_PATH="tools/sprites/style-reference.png" npm run sprites:generate:v1
```

Optional atlas/frame sizing:

```bash
# Base frame size for most keys
SPRITE_ATLAS_CELL_SIZE=64
# Large frame size for tile.space
SPRITE_SPACE_ATLAS_SIZE=256
# Max atlas width before new row
SPRITE_ATLAS_MAX_WIDTH=3072
```

## 6) Edit sheet workflow from curated art

Export the current curated set to an editable sheet:

```bash
npm run sprites:edit:export
```

Then edit:

- `/Users/ryan.boye/Documents/New project/tools/sprites/edit/v1/v1-edit.png`

And import it back into curated art:

```bash
npm run sprites:edit:apply:activate
```

This updates `curated`, then rebuilds the runtime atlas.

## 7) Edit-ready tile sheet workflow (no hidden downscale)

This workflow exports full tile keys from `curated` to a single editable contact sheet at native target sizes:

- `tile.space` at `256x256`
- all other tile keys at `64x64`

Export edit sheet + key map + labeled guide:

```bash
npm run sprites:edit:export:tiles
```

Outputs:

- `/Users/ryan.boye/Documents/New project/tools/sprites/edit/tiles-full/tiles-full-edit.png` (edit this file)
- `/Users/ryan.boye/Documents/New project/tools/sprites/edit/tiles-full/tiles-full-map.json` (rect/key map)
- `/Users/ryan.boye/Documents/New project/tools/sprites/edit/tiles-full/tiles-full-guide.png` (labels reference)

Apply edited sheet back into curated tiles and rebuild runtime atlas:

```bash
npm run sprites:edit:apply:tiles:activate
```

Important:

- Edit only inside mapped tile rectangles in `tiles-full-edit.png`.
- If map dimensions or key rectangles are invalid, import fails with key-specific errors.
- Packing preserves exact-sized inputs without resizing when source dimensions already match the target frame.

## 8) Output paths

- Curated source art: `/Users/ryan.boye/Documents/New project/tools/sprites/curated`
- Raw outputs: `/Users/ryan.boye/Documents/New project/tools/sprites/out/raw`
- Processed outputs: `/Users/ryan.boye/Documents/New project/tools/sprites/out/processed`
- Runtime atlas: `/Users/ryan.boye/Documents/New project/public/assets/sprites/atlas.png`
- Runtime manifest: `/Users/ryan.boye/Documents/New project/public/assets/sprites/atlas.json`
- Floors/walls atlas: `/Users/ryan.boye/Documents/New project/public/assets/sprites/atlas-floors-walls.png`
- Floors/walls manifest: `/Users/ryan.boye/Documents/New project/public/assets/sprites/atlas-floors-walls.json`
- Tile edit sheet: `/Users/ryan.boye/Documents/New project/tools/sprites/edit/tiles-full/tiles-full-edit.png`
- Tile edit guide: `/Users/ryan.boye/Documents/New project/tools/sprites/edit/tiles-full/tiles-full-guide.png`
