// Phase 2 wiring — binds the progression UI primitives from phase 1 to the
// real game's build-legend UI. Replaces the prior `display: none` hiding
// logic in main.ts::refreshUnlockLegendAndHotkeys with the locked/coming-
// next-tier states from the spec.
//
// Spec: https://bmo.ryanboye.com/spacegame-plan/progression.html
//
// Shape:
//   - applyLegendStates(state, entries, tooltipCopy) — pure paint.
//   - attachLegendTooltipHandlers(entries, tooltipCopy) — one-time install.
//   - maybeFireTierFlash(prevTier, currentTier, flashSpec) — one-shot per
//     advance; idempotent if called with prev === current.
//
// Consumer decides the tooltip copy — we don't import `UNLOCK_CRITERIA`
// strings so this module stays coupled only to shapes.

import type { RoomType, StationState, UnlockTier } from '../../sim/types';
import { isRoomUnlockedAtTier, ROOM_UNLOCK_TIER } from '../../sim/content/unlocks';
import { showTooltip, hideTooltip } from './tooltip';
import { showTierTransition } from './flash';
import type { ToolButtonState } from './types';
import './styles.css';

/** Text resolver — consumer passes one that maps tier → "do X to unlock"
 *  copy. Lets main.ts keep the canonical string source (it already has a
 *  tierRequirementText helper we don't want to duplicate here). */
export type TierCopyFn = (tier: UnlockTier) => string;

/** Pretty-display name resolver for a room — consumer owns it (main.ts
 *  already has the legend labels; we just pass room → human name). */
export type RoomNameFn = (room: RoomType) => string;

/**
 * Compute the state for one room given the player's current tier. Inlined
 * here instead of reusing button-state.ts's generic `computeToolButtonState`
 * because the tier map for rooms lives in ROOM_UNLOCK_TIER (a flat record,
 * not the mock-tier shape). Matches spec semantics exactly:
 *   available         = player.tier ≥ room.tier
 *   coming-next-tier  = room.tier === player.tier + 1
 *   locked            = otherwise
 */
export function stateForRoom(room: RoomType, playerTier: UnlockTier): ToolButtonState {
  const req = ROOM_UNLOCK_TIER[room];
  if (isRoomUnlockedAtTier(room, playerTier)) return 'available';
  if (req === playerTier + 1) return 'coming-next-tier';
  return 'locked';
}

/**
 * Paint `data-progression-state` on every legend entry in `entries`. Runs
 * per-render from main.ts::refreshUnlockLegendAndHotkeys. Cheap — one
 * attribute set per room + a count of how many are locked (for the caller
 * to log / display if desired).
 *
 * Critically: DOES NOT set `display: none`. The whole point of the
 * progression UI is keeping locked items visible so the tooltip can teach
 * the player what unlocks them.
 */
export function applyLegendStates(
  state: StationState,
  entries: ReadonlyMap<RoomType, HTMLElement>,
): { available: number; locked: number; comingNext: number } {
  const tier = state.unlocks.tier;
  let available = 0;
  let locked = 0;
  let comingNext = 0;
  for (const [room, el] of entries) {
    const btn = stateForRoom(room, tier);
    // Always clear any lingering inline `display: none` from the old code
    // path — otherwise a deploy that swaps in the new wiring over an
    // existing DOM (hot-reload during dev) would leave locked items still
    // hidden and the tooltips unreachable.
    if (el.style.display === 'none') el.style.display = '';
    el.dataset.progressionState = btn;
    if (btn === 'available') available++;
    else if (btn === 'locked') locked++;
    else comingNext++;
  }
  return { available, locked, comingNext };
}

/**
 * Install a delegated click-capture on the shared legend container (or on
 * each entry). Catches clicks on locked / coming-next-tier items and:
 *   - prevents the default build-tool selection
 *   - shows the tooltip
 *
 * Available items pass through untouched — main.ts's existing click
 * handler continues to select the tool.
 *
 * Call ONCE at main.ts startup. Safe to call twice (tracked via a
 * well-known property on the container to avoid duplicate listeners).
 */
export function attachLegendTooltipHandlers(
  entries: ReadonlyMap<RoomType, HTMLElement>,
  nameFor: RoomNameFn,
  copyFor: TierCopyFn,
): void {
  for (const [room, el] of entries) {
    // Per-element listener. Capture phase so we intercept BEFORE main.ts's
    // own click handler runs on the bubble phase.
    const alreadyAttached = (el as unknown as { _progAttached?: boolean })._progAttached;
    if (alreadyAttached) continue;
    (el as unknown as { _progAttached: boolean })._progAttached = true;

    el.addEventListener('click', (ev) => {
      const btnState = el.dataset.progressionState;
      if (btnState === 'locked' || btnState === 'coming-next-tier') {
        ev.preventDefault();
        ev.stopPropagation();
        const tier = ROOM_UNLOCK_TIER[room];
        showTooltip(el, {
          itemId: room,
          itemName: nameFor(room),
          tier,
          triggerDescription: copyFor(tier),
        });
      } else {
        // Available — hide tooltip if one happens to be up from a prior
        // interaction, then let main.ts's handler proceed.
        hideTooltip();
      }
    }, true);
  }
}

/** Optional tier-label + theme copy lookup for the flash. Consumer can
 *  pass this to enrich the "you unlocked X" card with the BMO-authored
 *  name + theme from PROGRESSION_TOOLTIP_COPY; omit to fall back to bare
 *  "Tier N → Tier M" + unlocked-item list. */
export type TierLabelFn = (tier: UnlockTier) => { name?: string; theme?: string } | undefined;

/**
 * Fire the tier-transition flash if the player advanced since the last
 * call. Consumer owns the `prev` value and updates it from the returned
 * `to` on each call.
 *
 * Returns the new tier so the caller can stash it for the next tick's
 * comparison: `prevTier = maybeFireTierFlash(prevTier, state, ...);`
 *
 * Newly-unlocked room names are computed against ROOM_UNLOCK_TIER.
 */
export function maybeFireTierFlash(
  prevTier: UnlockTier,
  state: StationState,
  nameFor: RoomNameFn,
  labelFor?: TierLabelFn,
): UnlockTier {
  const now = state.unlocks.tier;
  if (now <= prevTier) return now;
  const newlyUnlockedRooms: RoomType[] = [];
  for (const roomStr of Object.keys(ROOM_UNLOCK_TIER) as RoomType[]) {
    const req = ROOM_UNLOCK_TIER[roomStr];
    if (req > prevTier && req <= now) newlyUnlockedRooms.push(roomStr);
  }
  const labels = labelFor?.(now);
  // Capture the player's pause state at the moment the flash opens so we
  // can restore it on dismiss — if they were already paused, we don't want
  // to yank them back into play.
  let wasPaused = false;
  // Fire the flash. Deliberately fire-and-forget — if the player triggers
  // two advances in rapid succession, the second flash dismisses the first
  // (flash.ts::showTierTransition handles that internally, including
  // invoking the replaced spec's onDismiss so pause state stays balanced).
  void showTierTransition({
    fromTier: prevTier,
    toTier: now,
    unlockedNames: newlyUnlockedRooms.map(nameFor),
    tierName: labels?.name,
    tierTheme: labels?.theme,
    onShow: () => {
      wasPaused = state.controls.paused;
      state.controls.paused = true;
    },
    onDismiss: () => {
      state.controls.paused = wasPaused;
    },
  });
  return now;
}
