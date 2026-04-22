# Progression UI primitives

Phase-1 render primitives for BMO's tier/unlock system
([spec](https://bmo.ryanboye.com/spacegame-plan/progression.html)).

Isolated module — no touch to `src/main.ts` or the render hot path. Imports
from here are opt-in. Phase-2 will wire these into the actual tool palette
once `src/sim/content/unlocks.ts` v2 is in (tinyclaw's lane, landed in 93a0cd6).

## What's in here

| File | Role |
| --- | --- |
| `types.ts` | `ToolButtonState`, `ProgressionState`, `MockTierDef`, `TooltipSpec`, `TierTransitionSpec`. |
| `button-state.ts` | `computeToolButtonState(id, tiers, state)` — pure fn. |
| `tooltip.ts` | `showTooltip(anchor, spec)` / `hideTooltip()` — singleton DOM node. |
| `flash.ts` | `showTierTransition(spec)` — "you unlocked X!" overlay. |
| `styles.css` | `data-progression-state` variants + tooltip + flash. |
| `index.ts` | Barrel export. |

## Contract (matches progression.html §locked-state-ui-contract)

Every build-tool button receives a `data-progression-state` attribute:

```html
<button class="tool-btn" data-progression-state="available">Dorm</button>
<button class="tool-btn" data-progression-state="locked">Workshop</button>
<button class="tool-btn" data-progression-state="coming-next-tier">Market</button>
```

- **available** — full interactive, no style override.
- **locked** — 40% opacity, padlock overlay, `cursor: help`. Clicking should
  show the tooltip, NOT trigger the underlying tool.
- **coming-next-tier** — visible, slow pulse, "next" pip on the top-right.

## Phase-1 demo

Run the demo to eyeball the three states + tooltip + flash:

```bash
npm run dev
# then visit http://localhost:5174/progression-demo.html
```

The demo uses a mock 4-tier map so the render can be exercised before the
real UnlockState is wired.

## Phase-2 integration sketch

```ts
import {
  computeToolButtonState,
  showTooltip,
  hideTooltip,
  findOwningTier,
  showTierTransition,
} from './render/progression';
import './render/progression/styles.css';

// On each build-palette render pass:
for (const toolBtn of toolButtons) {
  const state = computeToolButtonState(
    toolBtn.dataset.toolId!,
    tierMap,
    progressionState,
  );
  toolBtn.dataset.progressionState = state;
}

// Delegated click — lock → tooltip instead of placement:
toolPalette.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest('[data-progression-state]');
  if (!btn) return;
  if (btn.getAttribute('data-progression-state') === 'locked') {
    ev.preventDefault();
    ev.stopPropagation();
    const tier = findOwningTier(btn.dataset.toolId!, tierMap);
    if (tier) {
      showTooltip(btn as HTMLElement, {
        itemId: btn.dataset.toolId!,
        itemName: btn.dataset.toolName ?? btn.dataset.toolId!,
        tier: tier.tier,
        triggerDescription: tier.triggerDescription,
      });
    }
    return;
  }
  hideTooltip();
  // ... existing tool-selection path
});

// When sim tick advances the tier:
onTierAdvance((prevTier, newTier, unlocked) => {
  showTierTransition({
    fromTier: prevTier,
    toTier: newTier,
    unlockedNames: unlocked.map((id) => prettyNameFor(id)),
  });
});
```
