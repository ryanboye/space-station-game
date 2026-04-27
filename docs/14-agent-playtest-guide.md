# Agent Playtest Guide

Practical knowledge for AI agents running automated playtests against the live game (e.g., the BMO `bmo.ryanboye.com/spacegame-preview/` mirror). Written from real session experience 2026-04-26 → 2026-04-27 — every entry is a problem an agent hit and resolved.

If you're a future agent doing playtest work: **read this before writing your first script.** It will save you several hours.

## The harness

A reusable JavaScript module exists at (machine-local) `/tmp/spacegame-harness.mjs` covering: page launch, world↔screen coordinate translation, paint/place/inspect helpers, build helpers per room, modal-close, tier-flash dismissal, and screenshot capture. **Use it. Don't rewrite from scratch.**

If you're starting on a fresh machine where that file doesn't exist, port the harness or rebuild — but the design decisions in it (especially the click-delivery one below) are not optional.

## The single most important rule

**`page.mouse.click(x, y)` does NOT reliably deliver clicks to the game canvas in headless mode.** Discovered 2026-04-27. The canvas's mousedown handler simply doesn't fire.

What works: dispatch `MouseEvent`s directly via `page.evaluate`:

```js
const c = document.querySelector('canvas#game');
const ev = (type, buttons) => new MouseEvent(type, {
  bubbles: true, cancelable: true, view: window,
  button: 0, buttons, clientX: cx, clientY: cy
});
c.dispatchEvent(ev('mousedown', 1));
c.dispatchEvent(ev('mouseup', 0));
window.dispatchEvent(ev('mouseup', 0));  // also fan to window-level handler
```

The harness's `_clickCanvasAt` and `_dragCanvasFromTo` already do this. **If your script doesn't paint or your inspector clicks aren't registering, this is the cause.**

## Room activation — what makes it actually work

Painting a room sets `state.rooms[i] = 'cafeteria'` but **does not activate the room.** Activation requires (per `src/sim/balance.ts:111` and `docs/02-build-and-world.md`):

1. **Cluster size ≥ `minTiles`** (varies by room — Cafeteria 12, Kitchen 8, Workshop 10, etc.)
2. **All `requiredModules` placed inside the cluster** at the correct counts (Cafeteria needs 1 ServingStation + 2 Tables; placing only 1 Table fails)
3. **A Door tile on the room's perimeter wall** — open-plan rooms (no internal walls) won't activate
4. **The cluster pressurized** (sealed by walls + door, no leaks to space)
5. **A path from the dock/core** for visitors to reach it

If the room's `Inactive reasons:` line in the modal says anything, the room isn't running. The alerts panel does **not** aggregate this — you must click each room to see why.

### Room build recipe (the playable one)

For each room you build:

```
1. Pick an interior rect of size ≥ minTiles + headroom (2-3 tiles spare)
2. Paint Floor where missing (defaults are usually already Floor inside the
   starter station box)
3. Paint Wall around the perimeter (overlap existing perimeter walls is OK
   — setTile is idempotent)
4. Paint a single Door in one of those walls
5. Paint the Room type over the interior tiles
6. Place required modules — RESPECTING FOOTPRINTS (see next section)
```

**Build helpers** in the harness (`buildStarterCafeteria`, `buildHydroAndKitchen`, etc.) handle the room paint + module placement, but **they don't paint walls or doors automatically.** The caller is responsible for those. Recommend a `buildEnclosedRoom(roomType, x1, y1, x2, y2, doorPos, modules)` wrapper for future iterations.

## Module footprints — Tables collide

Modules have `width × height` footprints (in `src/sim/balance.ts:14`):

| Module | Footprint |
|---|---|
| Bed | 2×1 |
| Table | **2×2** |
| ServingStation | 2×1 |
| Stove | 2×1 |
| Workbench | 2×1 |
| GrowStation | 2×2 |
| RecUnit | 2×2 |
| GameStation | 2×2 |
| MarketStall | 2×1 |
| IntakePallet | 2×2 |
| StorageRack | 2×1 |
| MedBed | 2×1 |
| Couch | 2×1 |
| Gangway, CustomsCounter | 1×1 |
| CargoArm | 2×2 |

**Placing two 2×2 Tables at adjacent tiles will SILENTLY collide and fail** — only the first one places. Cafeteria layout that works for a 4×3 interior:

```
y+0..y+1, x..x+1   → Table A (2×2)
y+0..y+1, x+2..x+3 → Table B (2×2)
y+2,     x..x+1   → ServingStation (2×1)
y+2,     x+2..x+3 → empty walkable tiles
```

The harness's `buildStarterCafeteria` uses this layout. If you change Cafeteria size, redo the math.

## Tier-flash dismissal — the modal pauses the sim

When a tier predicate flips, a full-screen "Tier N — UNLOCKED" modal appears (`src/render/progression/flash.ts`). **It pauses the sim until clicked.** A bot must explicitly dismiss it or progression halts at every tier flip.

Use `dismissTierFlash(page)` from the harness — it queries `.progression-flash`, clicks if present.

**Polling pattern in a real-time-wait loop:**

```js
while (Date.now() - startMs < TOTAL) {
  await page.waitForTimeout(20_000);
  await h.dismissTierFlash(page);  // ← critical
  // ... read state, check tier, screenshot ...
}
```

## Real-time wait vs `advanceSim`

`__harnessAdvanceSim(seconds)` directly iterates `tick(state, step)` in a loop — but **ship arrivals don't reliably spawn** during advanceSim runs. 60 sim minutes via advanceSim → 0 visitors. 3 real minutes at 4× speed → 5+ visitor arrivals.

**For progression validation, always use real-time wait** at the chosen sim speed:

```js
await h.setSimSpeed(page, 4);
await h.setPaused(page, false);
await page.waitForTimeout(N * 60_000);  // real seconds × 4 = sim seconds
```

Use `advanceSim` only for jumping to specific moments in fixture-verification tests where ship arrivals don't matter.

## Crew staffing

Many systems need staff. Most rooms need 1 crew per active node. **Hire enough crew**:

```js
await h.hireCrew(page, 12);  // 12 covers the basic food chain + life support + market
```

If a room is `Inactive reasons: ` reports nothing wrong but `Staff: 0/1`, the room is built but no crew is assigned. Either hire more, or rebalance crew priority via `state.controls.crewPriorityPreset`.

## Cluster cache + room types

If you add a new RoomType to the codebase, **also add it to `CACHED_ROOM_TYPES` at `src/sim/sim.ts:584`**. Without this, `ensureRoomClustersCache` never iterates the new room type, `clusterByTile.get(tileIndex)` returns undefined for those tiles, `getRoomInspectorAt` returns null, and the room modal opens stale.

This was the bug behind PR #112 (RoomType.Berth was missing from the array). The fix is one line + a defensive comment block warning the next person.

## Capturing screenshots that show the station

Default: the gameWrap scroll position drifts as you paint, so by mid-build the canvas is showing empty space and the station is off-screen.

**Always frame before screenshot:**

```js
async function frameStation(page) {
  await page.evaluate(() => document.querySelector('#camera-reset')?.click());
  await page.waitForTimeout(300);
}
```

`#camera-reset` is the toolbar's "Fit Map" button. Clicking it auto-centers the viewport on the station. Discovered from awfml's tip 2026-04-27.

For tighter framing, use canvas-only screenshots:

```js
const c = await page.$('canvas#game');
if (c) await c.screenshot({ path: 'station.png' });
```

Or post-crop with `convert` (imagemagick):

```bash
convert full.png -crop 700x500+450+150 zoomed.png
```

## Closing modals before screenshot

When you click-inspect a tile, the room modal stays open. **Always close modals before user-facing screenshots:**

```js
await h.closeAllModals(page);
await frameStation(page);
await page.screenshot({ path: 'shot.png' });
```

`closeAllModals` queries every known modal id and adds the `'hidden'` class.

## Viewport size

Default playwright viewport (1280×800) cuts off the toolbar + sidebar in the game UI. **Use 1600×1000:**

```js
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
```

## State value formats

The save snapshot returned by `__harnessGetState()` uses **string values**, not numeric enums:

- `state.tiles[i]` ∈ `'space' | 'wall' | 'floor' | 'dock' | 'door' | 'reactor' | 'cafeteria' | 'security' | 'airlock' (v1)`
- `state.rooms[i]` ∈ `'none' | 'cafeteria' | 'dorm' | ... | 'berth'`
- `state.modules[*].type` ∈ kebab-case strings: `'gangway'`, `'customs-counter'`, `'cargo-arm'`, `'serving-station'`, `'grow-station'`, `'med-bed'`, `'cell-console'`, `'rec-unit'`, `'game-station'`, `'market-stall'`, `'intake-pallet'`, `'storage-rack'`, `'wall-light'`, etc.

`state.tiles[i] === 1` will never be true. Compare against strings.

## The save envelope wrapper

`__harnessGetState()` returns the **save envelope**:

```js
{ schemaVersion, gameVersion, createdAt, name, snapshot: { width, height, tiles, rooms, modules, ... } }
```

Real state is in `.snapshot`. The harness's `getState(page)` already peels this for you.

## Screenshotting the right thing

awfml's preference (2026-04-27): canvas-cropped, station-framed shots. Don't send screenshots with modals overlaid or the station tucked in a corner of empty space. **The viewer is judging the station's design, not the harness.** Frame the station, close modals, capture clearly.

## Recommended playtest scaffold

```js
import * as h from '/tmp/spacegame-harness.mjs';
import pw from '/home/claudebot/node_modules/playwright/index.js';

const browser = await pw.chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.goto('https://bmo.ryanboye.com/spacegame-preview/');
await page.waitForFunction(() => window.__harnessReady === true);
await page.waitForTimeout(1500);

await h.hireCrew(page, 12);
await h.buildStarterCafeteria(page, 26, 15);
// ... build other rooms with walls + doors ...

await h.closeAllModals(page);
await page.evaluate(() => document.querySelector('#camera-reset')?.click());
await page.waitForTimeout(300);
await page.screenshot({ path: 'after-build.png' });

await h.setSimSpeed(page, 4);
await h.setPaused(page, false);

const startMs = Date.now();
while (Date.now() - startMs < 12 * 60_000) {
  await page.waitForTimeout(20_000);
  await h.dismissTierFlash(page);
  // poll, screenshot at tier flips
}

await browser.close();
```

## Known unsolved-as-of-2026-04-27

- `expandMap`-aware build helpers don't exist. To build past the starter station box, you have to earn 2000+ credits then call `expandMap`. Currently the harness lacks a wrapper for this.
- T2 progression (creditsEarnedLifetime ≥ 500) requires sustained meal production for ~5–10 minutes real time at 4× speed. If meal production stops, the predicate stalls — debug via the room inspector's hints + alerts panel.
- T4 (incidentsResolvedLifetime ≥ 1) requires Restricted-zone tiles + visitor trespass + Security crew dispatch — multi-system orchestration, not yet validated.
- T5 (residentsConvertedLifetime ≥ 1) needs Dorm with `private_resident` housing policy + adjacent Hygiene + actual visitor → resident conversion roll. Several conditions chained.

Future agents extending this guide: when you find a new "the thing only works if you do X" rule, add it here. The agent after you will thank you.
