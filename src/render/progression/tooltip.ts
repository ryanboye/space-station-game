// Tooltip component for locked tool-palette buttons.
//
// Single tooltip element is created once and reused — positioned near the
// triggering element on show, hidden on blur / outside-click / escape.
// Matches the copy pattern from BMO's progression.html:
//
//   🔒 Locked — tier 3
//   Workshop
//   Unlocks when you earn 500 credits and serve 3 archetypes in one cycle.

import type { TooltipSpec } from './types';

// One shared node — we only ever show one tooltip at a time.
let tooltipEl: HTMLDivElement | null = null;

/** Ensure the singleton tooltip element exists in the DOM, return it. */
function getOrCreateTooltip(): HTMLDivElement {
  if (tooltipEl) return tooltipEl;
  const el = document.createElement('div');
  el.className = 'progression-tooltip';
  el.setAttribute('role', 'tooltip');
  el.setAttribute('aria-hidden', 'true');
  // Build the 3-line template once; show/hide swaps text content.
  el.innerHTML = `
    <div class="progression-tooltip__header">
      <span class="progression-tooltip__lock">🔒</span>
      <span class="progression-tooltip__tier"></span>
    </div>
    <div class="progression-tooltip__name"></div>
    <div class="progression-tooltip__trigger"></div>
  `;
  document.body.appendChild(el);
  tooltipEl = el;
  return el;
}

/**
 * Show the tooltip near the given anchor element, populated with the
 * spec's content. Handles viewport-edge flip so tooltips near the right
 * edge of screen open to the LEFT instead of clipping.
 *
 * Auto-hides on next outside-click, scroll, or Escape keypress.
 */
export function showTooltip(anchor: HTMLElement, spec: TooltipSpec): void {
  const el = getOrCreateTooltip();
  // Populate copy
  const tierEl = el.querySelector('.progression-tooltip__tier') as HTMLSpanElement;
  const nameEl = el.querySelector('.progression-tooltip__name') as HTMLDivElement;
  const triggerEl = el.querySelector('.progression-tooltip__trigger') as HTMLDivElement;
  tierEl.textContent = `Locked — tier ${spec.tier}`;
  nameEl.textContent = spec.itemName;
  triggerEl.textContent = spec.triggerDescription;

  // Position. Default: directly below anchor, left-aligned to anchor left
  // edge. Flip to above/right if that would clip.
  el.style.visibility = 'hidden';
  el.style.display = 'block';
  el.setAttribute('aria-hidden', 'false');
  const anchorRect = anchor.getBoundingClientRect();
  const tipRect = el.getBoundingClientRect();
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const gap = 6;

  let left = anchorRect.left;
  let top = anchorRect.bottom + gap;
  if (left + tipRect.width > viewportW - 8) {
    // Too close to right edge — right-align to anchor
    left = Math.max(8, anchorRect.right - tipRect.width);
  }
  if (top + tipRect.height > viewportH - 8) {
    // Would overflow bottom — flip above the anchor
    top = anchorRect.top - tipRect.height - gap;
  }
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.style.visibility = 'visible';

  // Dismiss handlers. Registered per-show and cleaned up on hide so we
  // don't stack listeners across repeat invocations.
  const dismiss = (ev?: Event): void => {
    if (ev && ev.type === 'mousedown') {
      const target = ev.target as Node;
      if (el.contains(target) || anchor.contains(target)) return;
    }
    hideTooltip();
  };
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') hideTooltip();
  };
  // Stash on element for cleanup.
  (el as unknown as { _dismiss?: () => void })._dismiss = () => {
    document.removeEventListener('mousedown', dismiss, true);
    document.removeEventListener('scroll', dismiss, true);
    document.removeEventListener('keydown', onKey, true);
  };
  document.addEventListener('mousedown', dismiss, true);
  document.addEventListener('scroll', dismiss, true);
  document.addEventListener('keydown', onKey, true);
}

/** Hide the tooltip if visible. Safe to call multiple times. */
export function hideTooltip(): void {
  if (!tooltipEl) return;
  tooltipEl.style.display = 'none';
  tooltipEl.setAttribute('aria-hidden', 'true');
  const cleanup = (tooltipEl as unknown as { _dismiss?: () => void })._dismiss;
  if (cleanup) cleanup();
}
