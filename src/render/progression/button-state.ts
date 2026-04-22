// Pure function: compute the button state for a given item id given the
// current progression state + the tier definitions. No DOM touch.
//
// The "coming-next-tier" signal is narrow by design — only items whose
// unlock tier is exactly `currentTier + 1` qualify. Items two tiers ahead
// render as 'locked' (not "coming"), so the "next up" pip actually tells
// the player what they're about to get, not a 3-step roadmap preview.

import type { MockTierDef, ProgressionState, ToolButtonState } from './types';

/**
 * Decide how a tool-palette button should render.
 *
 * @param itemId       — opaque id from the tier map (phase 2 will be a
 *                       RoomType|ModuleType, phase 1 is a string).
 * @param tiers        — full tier map, sorted ascending by `tier`.
 * @param state        — current progression state.
 *
 * @returns ToolButtonState. Returns 'available' for items that appear in
 *          `state.unlockedIds`. Items in the next-tier bucket return
 *          'coming-next-tier'. Everything else returns 'locked'.
 *
 * If the item is not in any tier's unlock list, we default to 'locked' —
 * safer than 'available' because a typo in tier data can't accidentally
 * hand the player a build option they shouldn't have.
 */
export function computeToolButtonState(
  itemId: string,
  tiers: readonly MockTierDef[],
  state: ProgressionState,
): ToolButtonState {
  if (state.unlockedIds.has(itemId)) return 'available';

  const ownerTier = tiers.find((t) => t.unlocks.includes(itemId));
  if (!ownerTier) return 'locked';

  if (ownerTier.tier === state.currentTier + 1) return 'coming-next-tier';
  return 'locked';
}

/**
 * Find the tier that owns a given item. Returns undefined if unknown.
 * Callers use this to build the tooltip (needs both tier number + trigger
 * description).
 */
export function findOwningTier(
  itemId: string,
  tiers: readonly MockTierDef[],
): MockTierDef | undefined {
  return tiers.find((t) => t.unlocks.includes(itemId));
}
