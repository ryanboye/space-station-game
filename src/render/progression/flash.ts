// Tier-transition flash overlay — the "you unlocked X!" moment.
//
// Full-viewport momentary overlay that appears when the player advances to a
// new tier. Lists the items newly available. Dismisses after ~3.5s OR on
// click/tap. Non-blocking: the game underneath stays interactive.
//
// Design intent (from progression.html): reward + redirect attention. The
// flash shouldn't interrupt play — it should make the player notice the new
// stuff in the build palette. Short, un-dismissable-by-keyboard-accident,
// no modal dialog.

import type { TierTransitionSpec } from './types';

let activeOverlay: HTMLDivElement | null = null;

/**
 * Show the tier-transition flash. Returns a Promise that resolves when the
 * overlay fades out (either timer-based or user-dismissed). Safe to call
 * while another flash is mid-animation — the in-flight one is dismissed
 * immediately and replaced (no stacking).
 */
export function showTierTransition(spec: TierTransitionSpec): Promise<void> {
  // Tear down any previous overlay so we don't stack animations.
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }

  const overlay = document.createElement('div');
  overlay.className = 'progression-flash';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="progression-flash__card">
      <div class="progression-flash__meta">Tier ${spec.fromTier} → Tier ${spec.toTier}</div>
      <div class="progression-flash__title">You unlocked:</div>
      <ul class="progression-flash__items">
        ${spec.unlockedNames.map((n) => `<li>${escapeHTML(n)}</li>`).join('')}
      </ul>
      <div class="progression-flash__hint">tap to dismiss</div>
    </div>
  `;
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  // Force reflow so the CSS transition kicks in from 0 → visible.
  // Without this, appending + adding the class in the same tick skips
  // the initial frame and the fade-in doesn't play.
  void overlay.offsetWidth;
  overlay.classList.add('progression-flash--visible');

  return new Promise<void>((resolve) => {
    const teardown = (): void => {
      if (overlay !== activeOverlay) return;  // already replaced; caller's resolve was handled
      overlay.classList.remove('progression-flash--visible');
      // Give the fade-out a beat, then remove from DOM.
      setTimeout(() => {
        if (overlay.parentElement) overlay.remove();
        if (activeOverlay === overlay) activeOverlay = null;
        resolve();
      }, 300);
    };
    const timer = window.setTimeout(teardown, 3500);
    overlay.addEventListener('click', () => {
      clearTimeout(timer);
      teardown();
    });
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
