# Render Pipeline

The renderer is read-only — it never mutates `state`. One per-frame entry point composites three cached layers plus dynamic overlays.

## Entry point — `renderWorld`

`src/render/render.ts:1381`. Per-frame, in this order:

1. `ensureStaticLayer` (`render.ts:1011`) — terrain, zones, room overlays, dock labels, core marker. Cached.
2. `ensureDecorativeLayer` (`render.ts:1099`) — floor grime/wear + module visuals. Cached.
3. `renderGlowPass` (`src/render/glow-pass.ts:143`) — additive emitters (lights, stoves, reactor). Cached.
4. **Dynamic overlays** repaint per-frame: inactive-room dim (alpha 0.22), blocked-tile red, depressurized red wash (alpha 0.08), service-node markers, body markers, module inventory bars, hover/preview, agents, ships, brownout tint, tool legend.

## The three cached layers

### 1. Static layer — `ensureStaticLayer`

`render.ts:1011`. Paints terrain (`TILE_SPRITE_KEYS`), zones, room overlays/letters, dock labels, core marker, and **conditionally** the dual-tilemap walls + wall detail layer + door layer + door-dock detail layer + room labels.

Cache key (`render.ts:1027`): `topologyVersion + roomVersion + showZones + useSprites + wallRenderMode + spriteAtlas.version`.

If `wallRenderMode === 'dual-tilemap'` and `useSprites`, also runs:

- `renderDualWallLayer` (`wall-dual-tilemap.ts:84`)
- `renderWallDetailLayer` (`wall-detail-layer.ts:205`)
- `renderDoorLayer`
- `renderDoorDockDetailLayer`
- `renderRoomLabelLayer`

…all *into the static cache*.

### 2. Decorative layer — `ensureDecorativeLayer`

`render.ts:1099`. Floor grime/wear overlays + `drawModuleVisual` for every `moduleInstance`. Cache key includes `moduleVersion + dockVersion`.

### 3. Glow layer — `renderGlowPass`

`src/render/glow-pass.ts:143`. Additive-blend pass (gated by `controls.showGlow`). Cache key: `roomVersion + moduleVersion + dynamic signature` (`buildDynamicSignature` `glow-pass.ts:119`) — the dynamic sig captures medbed occupancy, kitchenActive, reactorsActive.

Emitters:

| Emitter | Color | When |
|---|---|---|
| Wall lights | warm amber, downward cone | always |
| Stove | orange | kitchenActive AND room is Kitchen |
| Reactor floor tiles | red-orange | always |
| MedBed | cyan | when occupied |
| GrowStation | green | always |
| Terminal | cyan | always |
| GameStation | violet | always |

Color constants at `glow-pass.ts:58`–61. `awfml 2026-04-23` comment: don't push alpha above 0.25 or additive accumulation produces "weird orange glow."

`invalidateGlowCache()` (`glow-pass.ts:33`) exists but is currently unused — cache is purely key-driven.

## Sprite atlas

**`loadSpriteAtlas`** at `src/render/sprite-atlas.ts:145`. Fetches `assets/sprites/atlas.json` (versioned `?v=` query for cache-bust). Manifest gives per-key `frame`, optional `rotation`, `offset`, `blendMode`, `alpha`.

**`drawSpriteByKey`** at `render.ts:359` is the universal blitter. **`drawTintedAgentSprite`** (`render.ts:396`) uses an offscreen canvas to recolor an agent sprite per mood.

Atlas manifest URL: `assets/sprites/atlas.json` (single-pipeline, currently `nano-banana`). The pipeline string is `state.controls.spritePipeline` (`types.ts:925`) — designed as a union so a future `gpt-image-1` alternate can slot in.

## Sprite key contracts

Two key contracts coexist:

- **`src/render/sprite-keys.ts`** — gameplay-stable contract. TILE / WALL / DOOR / ROOM / MODULE / SHIP key sets. The renderer always maps these.
- **`src/render/sprite-keys-extended.ts`** — forward-looking. AGENT 6-variant arrays, AGENT_OVERLAY, FX, DOCK_OVERLAY (4 + rotation), FLOOR_GRIME, FLOOR_WEAR. The `EXTERIOR_WALL_OVERLAY_SPRITE_KEYS removed 2026-04-23` comment (`sprite-keys-extended.ts:72`) flags an atlas-space cleanup.

Both files are imported from `render.ts`.

## Wall rendering — three coexisting paths

**This is the highest-trip-wire area in the renderer.** Three wall draw paths exist; the active one depends on `state.controls.wallRenderMode` and `controls.spriteMode`.

### 1. Per-cell (default)

Each Wall tile draws its `WALL_SPRITE_VARIANT_KEYS[shape]` from `resolveWallVariantForTile` (`src/render/tile-variants.ts:87`). Variants: `solo`, `end`, `straight`, `straight.vertical`, `corner`, `tee`, `cross`.

**Note `straight.vertical` is a separate sprite — rotating `straight` 90° loses the 3D shading** (`tile-variants.ts:5`–7).

Drawn in `drawTileSprite` (`render.ts:246`) called from `ensureStaticLayer`.

### 2. Dual-tilemap (PR #98+#107+#108)

When `wallRenderMode === 'dual-tilemap'` and sprites enabled, `renderDualWallLayer` (`src/render/wall-dual-tilemap.ts:84`) iterates the (W+1)×(H+1) corner grid. Each corner samples its 4 neighboring tiles via `sampleWallCorner` and `pickDualVariant` (`wall-dual-tilemap.ts:74`) looks up one of 6 canonical shapes (`empty`, `single_corner`, `edge`, `saddle`, `inner_corner`, `full`) plus a 0/90/180/270 rotation.

`WALL_DUAL_SPRITE_VARIANT_KEYS` at `wall-dual-tilemap.ts:8`.

Activated by `?walls=dual` URL param (`main.ts:692`).

**`isWallLikeTileForDual`** (`wall-dual-tilemap.ts:28`) — for the dual-tilemap shape lookup, both Wall and Door count as "wall-like" so the wall draws continuously through doors (Prison Architect style, awfml 2026-04-24). The door sprite renders on top in a later pass.

### 3. Wall detail layer (PR #98+)

`renderWallDetailLayer` (`src/render/wall-detail-layer.ts:205`) is a *secondary* overlay painting rim bands, hull contact-depth, corner bevels, and sparse wall-lights deterministically based on `hash2(x,y) % 7`. Adds art direction independent of the gen-pipeline output. Runs as part of the dual-tilemap path inside `ensureStaticLayer`.

## Sprite atlas cache-bust

`spriteAtlas.version` is the JSON's `version` field. Bumping the atlas (running `npm run sprites:pack`) changes this and forces the static + decorative + glow caches to drop. See `13-pipelines.md`.

## Player framing

The render pipeline has two performance levers the player can reach:

- **Sprite mode toggle** (top toolbar, `F2` hotkey). Falls back to vector primitives.
- **Sprite fallback toggle** (`F3`). Forces the vector path even with sprites loaded — useful for diagnostic.
- **Glow toggle**. Disables `glow-pass` entirely.

`?walls=dual` is opt-in — default is per-cell. Switching mid-session works because the static cache invalidates on the key.

## Tunables

- `TILE_SIZE = 32` (`types.ts:1`)
- Glow color constants (`glow-pass.ts:58`–61) — don't push alpha above 0.25
- Inactive-room dim alpha = 0.22 (`render.ts:1379`)
- Depressurized wash alpha = 0.08 (`render.ts:1447`) — historic value; see trip-wires

## Trip-wires

- **Static-layer cache key MUST include `wallRenderMode`** (`render.ts:1027`). Forking wall paths without bumping the key means switching modes mid-session won't repaint.
- **`straight.vertical` is a runtime-stable variant — don't try to consolidate via rotation.** The 3D shading breaks.
- **`renderWallDetailLayer` paints into the static cache, not the live ctx.** Triggering live wall-light flicker requires either repurposing this layer or moving emitters to glow-pass.
- **Depressurized red wash alpha is 0.08** (was 0.22 — dropped 2026-04-23). Bumping it back compounds with inactive-room dim and tints the demo-station rust-brown.
- **Glow alpha cap is ~0.25.** Above that, additive accumulation produces an orange haze across the station. Comment at `glow-pass.ts:58`.
- **`drawTintedAgentSprite` allocates an offscreen canvas per call.** Don't add new agent variants without checking the per-frame allocation budget — the existing tint cache (search `tintCache`) is keyed on `(spriteKey, color)`.
- **The renderer never mutates state.** If you need to bump a counter from rendering, push it into `state.controls` or a derived cache; don't write to `state.metrics` from `render.ts`.
