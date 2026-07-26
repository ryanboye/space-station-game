# Reclaim World Space in the Starter HUD

**Priority:** P2 UI pass after behavior tickets

## Problem

At a 1335x998 viewport, the starter world competes with:

- Global Goal, watch, and Site Brief stacked at left
- Build Palette occupying the full right side
- Selection, Operations, and Alerts across the bottom
- active pod/berth operations near the top

The station remains playable, but the physical space is not the dominant visual object. Several panels are useful only in particular modes.

## Proposed behavior

- Build Palette becomes a narrow category rail when the player is not actively placing something; selecting a category opens its contextual tray.
- Selection is absent or a compact placeholder until something is selected, without shifting the canvas.
- Operations summarizes only active constraints; detailed role coverage remains in Roster.
- Alerts occupy a compact stack and expand only when clicked.
- Site Brief collapses to its title, two economy actions, and the exceptional site modifier after the first operating day.
- Pod Ops stays collapsed by default. Berth Ops may expand for a selected berth or a blocked turnaround.

## Acceptance criteria

- At 1280x720 and 1366x768, at least 70% of the non-topbar viewport belongs to the world when no modal is open.
- No core state becomes inaccessible; compact controls have tooltips and stable click targets.
- Opening a build category, inspector, or alert does not resize or recenter the station unexpectedly.
- UI screenshots are reviewed at desktop and small-laptop sizes.
- Do not introduce horizontal scrolling or nested scroll panels.

## Likely ownership

- `src/main.ts` panel state and contextual visibility
- `src/styles.css` responsive layout
- visual verification through the in-app browser
