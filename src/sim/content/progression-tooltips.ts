// Player-facing copy for the 6-tier progression. Authored by BMO per
// progression.html spec; voice rules:
//
// - Every `trigger` names a concrete measurable thing the player can DO
//   (no "reach tier X" recursion, no abstract "progress further").
// - T0's trigger is a one-time onboarding sentence, not a condition —
//   the player is already at T0.
// - T6 chains on T5 completion instead of introducing a 7th lifetime
//   counter for the end-state.
// - Short enough to fit a ~200px locked-button tooltip on mobile.
//
// Usage map per surface:
//   locked + coming-next tooltips → name + trigger
//   tier-transition flash         → name + theme

import type { UnlockTier } from '../types';

export interface ProgressionTooltipCopy {
  /** Short title shown in the unlock flash overlay + current-tier HUD. */
  name: string;
  /** Subtitle one-liner explaining what the tier is about. */
  theme: string;
  /** Player-facing unlock trigger copy. Always "Unlocks when you X" voice. */
  trigger: string;
}

export const PROGRESSION_TOOLTIP_COPY: Record<UnlockTier, ProgressionTooltipCopy> = {
  0: {
    name: "You've arrived",
    theme: 'Keep core life support running and set up starter resupply.',
    trigger: 'Start here — build a dorm and hire one crew member.',
  },
  1: {
    name: 'Guest Services',
    theme: 'Add lounge and market service for visiting traffic.',
    trigger: 'Unlocks when your first visitor arrives at your station.',
  },
  2: {
    name: 'Production Logistics',
    theme: 'Scale material storage and produce goods for market sale.',
    trigger: 'Unlocks when you earn 500 credits and serve 3 visitor types.',
  },
  3: {
    name: 'Advanced Operations',
    theme: 'Add security, health, recreation, and advanced traffic controls.',
    trigger: 'Unlocks when you complete one workshop → market trade cycle.',
  },
  4: {
    name: 'Governance Roadmap',
    theme: 'Future civic rules and deeper zone control.',
    trigger: 'Unlocks when you resolve one dispatched security incident.',
  },
  5: {
    name: 'Health Roadmap',
    theme: 'Future resident care and medical depth.',
    trigger:
      'Unlocks when you treat one injured crew and convert one visitor to resident.',
  },
  6: {
    name: 'Specialization',
    theme: 'Complete the current progression track.',
    trigger: 'Unlocks when you complete the Health & Residents tier.',
  },
};
