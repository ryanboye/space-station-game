// Tier-transition flash overlay — the "you unlocked X!" moment.
//
// Full-viewport modal overlay that appears when the player advances to a
// new tier. Lists the items newly available. Stays up until the user
// clicks to dismiss (no auto-dismiss — the owner wants to screenshot the
// achievement). Consumer typically pauses the sim in `onShow` and restores
// the prior pause state in `onDismiss`.
//
// Design intent (from progression.html): reward + redirect attention. The
// flash is modal — darker backdrop, waits for a click — so the player can
// read the unlocked list and capture the moment.

import type { TierTransitionSpec } from './types';

let activeOverlay: HTMLDivElement | null = null;

/**
 * Show the tier-transition flash. Returns a Promise that resolves when the
 * overlay fades out (user-dismissed via click). Safe to call while another
 * flash is mid-animation — the in-flight one is dismissed immediately and
 * replaced (no stacking). If an `onDismiss` was set on the replaced spec,
 * it is invoked as part of that teardown so the caller's pause-state
 * bookkeeping stays balanced.
 */
export function showTierTransition(spec: TierTransitionSpec): Promise<void> {
  // Tear down any previous overlay so we don't stack animations. Fire its
  // onDismiss so pause state doesn't get stuck if two advances land
  // back-to-back.
  if (activeOverlay) {
    const prevDismiss = (activeOverlay as unknown as { _onDismiss?: () => void })._onDismiss;
    activeOverlay.remove();
    activeOverlay = null;
    if (prevDismiss) prevDismiss();
  }

  const overlay = document.createElement('div');
  overlay.className = 'progression-flash';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-live', 'polite');
  const tierLabel = spec.tierName
    ? `Tier ${spec.toTier} — ${escapeHTML(spec.tierName)}`
    : `Tier ${spec.fromTier} → Tier ${spec.toTier}`;
  const themeRow = spec.tierTheme
    ? `<div class="progression-flash__theme">${escapeHTML(spec.tierTheme)}</div>`
    : '';
  const unlockedSection = spec.unlockedNames.length
    ? `<div class="progression-flash__title">You unlocked:</div>
       <ul class="progression-flash__items">
         ${spec.unlockedNames.map((n) => `<li>${escapeHTML(n)}</li>`).join('')}
       </ul>`
    : '';
  overlay.innerHTML = `
    <div class="progression-flash__card">
      <div class="progression-flash__meta">${tierLabel}</div>
      ${themeRow}
      ${unlockedSection}
      <div class="progression-flash__hint">click to continue</div>
    </div>
  `;
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  // Force reflow so the CSS transition kicks in from 0 → visible.
  // Without this, appending + adding the class in the same tick skips
  // the initial frame and the fade-in doesn't play.
  void overlay.offsetWidth;
  overlay.classList.add('progression-flash--visible');

  // Fire onShow *after* mount so the consumer's side-effect (pausing the
  // sim) lines up with the frame the overlay becomes visible on.
  spec.onShow?.();

  return new Promise<void>((resolve) => {
    let dismissed = false;
    const teardown = (): void => {
      if (dismissed) return;
      dismissed = true;
      // Clear the stashed dismiss handler BEFORE invoking it, so a concurrent
      // replacement flash doesn't re-enter this same path.
      (overlay as unknown as { _onDismiss?: () => void })._onDismiss = undefined;
      spec.onDismiss?.();
      if (overlay !== activeOverlay) {
        // Replaced by a newer flash — DOM + activeOverlay already handled
        // by the replacer; just resolve.
        resolve();
        return;
      }
      overlay.classList.remove('progression-flash--visible');
      // Give the fade-out a beat, then remove from DOM.
      setTimeout(() => {
        if (overlay.parentElement) overlay.remove();
        if (activeOverlay === overlay) activeOverlay = null;
        resolve();
      }, 300);
    };
    // Stash a reference so the replacement path above can fire this
    // spec's onDismiss without having to re-enter `teardown`.
    (overlay as unknown as { _onDismiss?: () => void })._onDismiss = teardown;
    overlay.addEventListener('click', teardown);
  });
}

/** HTML-escape untrusted strings before interpolation. Just the obvious four. */
function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
