// Progression UI primitives — types.
//
// Shape follows BMO's progression.html locked-state UI contract:
// https://bmo.ryanboye.com/spacegame-plan/progression.html
//
// Three button states drive the render:
//   - 'available'          — fully interactive, full opacity
//   - 'locked'             — 40% opacity, padlock overlay, clicking shows
//                            tooltip instead of attempting placement
//   - 'coming-next-tier'   — visible but gated, faint pulse + "next up" pip
//
// Phase 1 (this module) uses a MOCK tier map so the render primitives can
// ship before tinyclaw's unlocks.ts v2 + awfml's milestone framework land.
// Phase 2 swaps the mock for the real UnlockState from src/sim/content/.

/** The three button states defined in the UI contract. */
export type ToolButtonState = 'available' | 'locked' | 'coming-next-tier';

/**
 * Minimal mock of the tier-map shape phase 2 will receive from
 * src/sim/content/unlocks.ts v2. Keep this narrow — we only care about
 * what drives the render.
 */
export interface MockTierDef {
  readonly tier: number;
  readonly label: string;
  /** Human-readable name of the pass condition (one sentence). */
  readonly triggerDescription: string;
  /** Items (by id) unlocked at this tier. ids are opaque strings phase 1,
   *  will map to RoomType|ModuleType|ToolType in phase 2. */
  readonly unlocks: readonly string[];
}

/**
 * Runtime progression state. Mirrors the shape phase 2 will get from
 * UnlockState + triggerProgress. `triggerProgress` is a 0..1 float per tier
 * — at tier N, `triggerProgress[N+1]` tells us how close the player is to
 * advancing (drives the "coming-next-tier" pulse intensity once we want it).
 */
export interface ProgressionState {
  readonly currentTier: number;
  /** Optional 0..1 progress toward the next tier. Undefined = unknown. */
  readonly nextTierProgress?: number;
  /** List of every item id the player has unlocked in the current tier
   *  and all prior tiers. Denormalized for O(1) lookup. */
  readonly unlockedIds: ReadonlySet<string>;
}

/**
 * Compose a tooltip spec from a locked item + its tier + trigger copy.
 * Renderer consumes this; keeps copy formatting centralized.
 */
export interface TooltipSpec {
  readonly itemId: string;
  readonly itemName: string;
  readonly tier: number;
  readonly triggerDescription: string;
}

/** Args for the tier-transition flash overlay. */
export interface TierTransitionSpec {
  readonly fromTier: number;
  readonly toTier: number;
  readonly unlockedNames: readonly string[];
  /** Optional — PROGRESSION_TOOLTIP_COPY[toTier].name. Renders as the
   *  flash title when set. Falls back to bare tier number. */
  readonly tierName?: string;
  /** Optional — PROGRESSION_TOOLTIP_COPY[toTier].theme. Renders as a
   *  subtitle in the flash card. Skipped if empty. */
  readonly tierTheme?: string;
}
