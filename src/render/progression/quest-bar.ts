// Quest-bar — pinned "what do I do now" strip at the top of the right
// sidebar. Reads existing progression data, no new sim fields or counters.
//
// Spec: BMO's Quest Bar v1 (2026-04-22 Discord thread).
//
// Why this exists: the overnight sprint (PRs #7, #11, #12, #14-#16) gave
// the player rules + descriptive copy — tooltips name triggers, status
// line says "Tier N", legend shows locked/coming-next. But nothing tells
// the player *what to actually do next*. awfml's playtest: "the game is
// correctly-coded but broken at onboarding." The quest bar closes that
// gap with a single always-visible strip.
//
// Shape:
//   - title:    TIER N — {name}        (accent gold, mono caps)
//   - goal:     Goal: {next-tier trigger}  (or terminal "Tutorial complete"
//                                          at T6)
//   - progress: [▓▓▓░░░░░] 37%         (fill + numeric pct)
//
// All three lines read from existing state:
//   state.unlocks.tier                         → current tier
//   PROGRESSION_TOOLTIP_COPY[tier].name        → title
//   PROGRESSION_TOOLTIP_COPY[tier+1].trigger   → goal text
//   state.unlocks.triggerProgress[tier+1]      → fill (0..1)
//
// Rerender is cheap (text + width change) and safe to call every tick.

import type { StationState, UnlockTier } from '../../sim/types';
import type { ProgressionTooltipCopy } from '../../sim/content/progression-tooltips';
import './styles.css';

/** Copy resolver — consumer passes PROGRESSION_TOOLTIP_COPY lookup. Keeps
 *  this module decoupled from the sim content surface so it could be
 *  reused with alternative tier copy (e.g. localized variants) if we ever
 *  need that. */
export type QuestBarCopyFn = (tier: UnlockTier) => ProgressionTooltipCopy | undefined;

/** Per-tier emoji prefix. Keeps the bar scannable at a glance without
 *  reading the title. Using station/sci-fi coded glyphs rather than the
 *  generic "⬡" so each tier feels distinct. */
const TIER_EMOJI: Record<UnlockTier, string> = {
  0: '⚓',  // arrival
  1: '🍽️', // sustenance
  2: '💰', // commerce
  3: '📦', // logistics
  4: '🛡️', // civic & security
  5: '⚕️', // health
  6: '🏆', // specialization / complete
};

/** DOM shape built once on mount. Cached refs avoid re-querying the
 *  container on every render tick. */
interface QuestBarDom {
  root: HTMLElement;
  title: HTMLElement;
  goal: HTMLElement;
  fill: HTMLElement;
  pct: HTMLElement;
}

/** Marker on the container element so we don't double-mount when main.ts's
 *  refresh loop calls us before/after a hot-reload. */
interface MountedContainer {
  _questBarDom?: QuestBarDom;
}

/**
 * Mount the quest bar into `container`. Idempotent — if already mounted,
 * returns the cached DOM. Called from main.ts after bootstrap.
 *
 * Caller is responsible for having placed an empty `<div id="quest-bar">`
 * in the HTML at the desired location (top of right sidebar). This function
 * populates that div with the bar structure.
 */
export function mountQuestBar(container: HTMLElement): QuestBarDom {
  const cached = (container as unknown as MountedContainer)._questBarDom;
  if (cached) return cached;

  container.classList.add('quest-bar');

  const header = document.createElement('div');
  header.className = 'quest-bar__header';
  const title = document.createElement('span');
  title.className = 'quest-bar__title';
  header.appendChild(title);

  const goal = document.createElement('div');
  goal.className = 'quest-bar__goal';

  const progressWrap = document.createElement('div');
  progressWrap.className = 'quest-bar__progress';

  const track = document.createElement('div');
  track.className = 'quest-bar__track';
  const fill = document.createElement('div');
  fill.className = 'quest-bar__fill';
  track.appendChild(fill);

  const pct = document.createElement('span');
  pct.className = 'quest-bar__pct';

  progressWrap.appendChild(track);
  progressWrap.appendChild(pct);

  container.appendChild(header);
  container.appendChild(goal);
  container.appendChild(progressWrap);

  const dom: QuestBarDom = { root: container, title, goal, fill, pct };
  (container as unknown as MountedContainer)._questBarDom = dom;
  return dom;
}

/**
 * Paint the quest bar for the player's current state. Idempotent — every
 * call computes the same output for the same state. Intended to be called
 * from the existing render loop (e.g. main.ts's
 * refreshUnlockLegendAndHotkeys) alongside other progression surfaces.
 *
 * Handles the T6 terminal case by swapping copy to "Tutorial complete"
 * and forcing the bar to 100%.
 */
export function renderQuestBar(
  state: StationState,
  container: HTMLElement,
  copyFor: QuestBarCopyFn,
): void {
  const dom = mountQuestBar(container);
  const tier = state.unlocks.tier;
  const isTerminal = tier >= 6;
  const nextTier = isTerminal ? null : ((tier + 1) as UnlockTier);

  // Title: "TIER N — NAME" (or "TUTORIAL COMPLETE" at terminal).
  const emoji = TIER_EMOJI[tier] ?? '⬡';
  const currentCopy = copyFor(tier);
  if (isTerminal) {
    dom.title.textContent = `${emoji} TUTORIAL COMPLETE`;
  } else {
    const name = currentCopy?.name?.toUpperCase() ?? '';
    dom.title.textContent = `${emoji} TIER ${tier}${name ? ` — ${name}` : ''}`;
  }

  // Goal: next tier's trigger copy (or terminal sandbox-unlocked line).
  if (isTerminal) {
    dom.goal.textContent = 'Full sandbox unlocked — build what you want.';
  } else if (nextTier !== null) {
    const nextCopy = copyFor(nextTier);
    dom.goal.textContent = nextCopy?.trigger
      ? `Goal: ${nextCopy.trigger}`
      : 'Goal: reach the next tier.';
  }

  // Progress bar: read the predicate's progress value from the sim.
  // Terminal locks to 100%; otherwise read triggerProgress[tier+1].
  const rawProgress = isTerminal
    ? 1
    : nextTier !== null
    ? state.unlocks.triggerProgress[nextTier] ?? 0
    : 0;
  const clamped = Math.max(0, Math.min(1, rawProgress));
  const pctInt = Math.round(clamped * 100);

  // Width as inline style — avoids a CSS-custom-property dance on every
  // tick. Passes through animation-free because the bar rerenders every
  // tick anyway; a transition would just cause lag visuals on speed>1x.
  dom.fill.style.width = `${pctInt}%`;
  dom.pct.textContent = `${pctInt}%`;

  // Data attribute lets CSS swap the fill color at 100% (celebratory gold
  // → green pulse) or during terminal state. Cheap to set, easy to
  // restyle later.
  dom.root.dataset.questBarState = isTerminal
    ? 'complete'
    : clamped >= 1
    ? 'ready'
    : 'active';
}
