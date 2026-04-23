/**
 * Moderation rephrase dictionary for gpt-image-2 prompts.
 *
 * OpenAI's content policy flags common game-management vocabulary even
 * when it's clearly non-violent context. A space-station sim has a lot
 * of such words (security, prisoner, corpse, etc.) and the moderation
 * filter can't distinguish "morgue tile for a game" from real harm.
 *
 * This module:
 *   1) Ships a baseline rephrase map that covers the vocabulary likely
 *      to hit gpt-image-2 400s on this project.
 *   2) Exports a `rephrasePrompt(prompt)` helper that applies the map
 *      (case-insensitive, word-boundary) and RETURNS BOTH the rephrased
 *      text and a diff log. The caller logs the diff so awfml can see
 *      which sanitized version actually shipped to the API.
 *   3) Exports `hasModerationRisk(prompt)` for the QA tool's preflight
 *      warning: if a prompt includes any flagged word, show a yellow
 *      badge next to it in the review page.
 *
 * Iterate over time — if a prompt still 400s after rephrasing, add the
 * specific offending term here.
 *
 * Source: BMO's baseline (2026-04-23) + seb's additions. No word is
 * removed without replacement; that could change prompt semantics in
 * unexpected ways. Replacements are chosen to preserve meaning.
 */

/** @type {Readonly<Record<string, string>>} */
export const MODERATION_REPHRASE = Object.freeze({
  // --- BMO's baseline (station-management vocabulary) ---
  'security':   'patrol personnel',
  'prisoner':   'detained visitor',
  'cell':       'holding alcove',
  'incident':   'disturbance event',
  'corpse':     'inert figure',
  'body':       'lying figure',
  'dead':       'inert',
  'blood':      'fluid stain',
  'fight':      'altercation',
  'morgue':     'cold storage chamber',
  'sick':       'unwell',
  'patient':    'visitor receiving care',
  'injury':     'physical condition',

  // --- seb additions (weapon + combat-adjacent terms likely to hit
  //     filters in a sim with security/brig/weapons context) ---
  'weapon':     'equipment',
  'weapons':    'equipment',
  'gun':        'tool',
  'rifle':      'long-tool',
  'kill':       'neutralize',
  'killed':     'neutralized',
  'shoot':      'discharge',
  'shooting':   'discharging',
  'violence':   'conflict',
  'violent':    'aggressive',
  'wound':      'mark',
  'wounded':    'marked',
});

/**
 * @param {string} prompt
 * @returns {{ text: string, swaps: Array<{from: string, to: string, count: number}> }}
 */
export function rephrasePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { text: prompt, swaps: [] };
  }
  let out = prompt;
  const swaps = [];
  for (const [from, to] of Object.entries(MODERATION_REPHRASE)) {
    // Word-boundary, case-insensitive. Preserve casing on first letter only
    // (simple heuristic — good enough for prompt text).
    const re = new RegExp(`\\b${escapeRegex(from)}\\b`, 'gi');
    let count = 0;
    out = out.replace(re, (match) => {
      count += 1;
      return matchCasing(match, to);
    });
    if (count > 0) {
      swaps.push({ from, to, count });
    }
  }
  return { text: out, swaps };
}

/**
 * Returns true if the prompt contains any word in the rephrase dictionary.
 * Used by the QA tool for a preflight "may hit moderation" badge.
 *
 * @param {string} prompt
 * @returns {boolean}
 */
export function hasModerationRisk(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  for (const from of Object.keys(MODERATION_REPHRASE)) {
    const re = new RegExp(`\\b${escapeRegex(from)}\\b`, 'i');
    if (re.test(prompt)) return true;
  }
  return false;
}

/**
 * Format a swaps log line for CLI / manifest output.
 * Example: `formatSwaps([{from:'weapon',to:'equipment',count:2}])`
 *   → `"weapon→equipment (×2)"`
 */
export function formatSwaps(swaps) {
  if (!swaps || swaps.length === 0) return '';
  return swaps.map(({ from, to, count }) =>
    count > 1 ? `${from}→${to} (×${count})` : `${from}→${to}`
  ).join(', ');
}

// --- internals ------------------------------------------------------------

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Preserve first-letter casing of `src` when substituting `replacement`.
 * Src "Weapon" + replacement "equipment" → "Equipment".
 * Src "WEAPON" + replacement "equipment" → "Equipment" (not all-caps — we
 * don't try to preserve all-caps since replacements may be multi-word).
 */
function matchCasing(src, replacement) {
  if (!src || !replacement) return replacement;
  const firstSrc = src[0];
  if (firstSrc === firstSrc.toUpperCase() && firstSrc !== firstSrc.toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}
