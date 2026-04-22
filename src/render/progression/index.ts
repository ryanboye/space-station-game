// Public barrel — phase 2 integrators import from here.
//
// Keep this file dependency-free at runtime (types + re-exports only) so
// tree-shaking can drop unused pieces when the real tool-palette wires in.

export type {
  MockTierDef,
  ProgressionState,
  TierTransitionSpec,
  ToolButtonState,
  TooltipSpec,
} from './types';

export { computeToolButtonState, findOwningTier } from './button-state';
export { showTooltip, hideTooltip } from './tooltip';
export { showTierTransition } from './flash';
