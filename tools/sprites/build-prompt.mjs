/**
 * Structured prompt builder for gpt-image-1.
 *
 * Wraps the per-key `prompt` string from `sprite-spec.yaml` with a
 * consistent envelope that steers gpt-image-1 toward:
 *   - pixel-art style (not photographic / illustration)
 *   - transparent background (sprite atlases composite on grids)
 *   - reference-image adherence (the caller passes awfml's mockup in
 *     `image[]` to `/v1/images/edits`; this prompt says "match it")
 *   - negative list that kills the usual unwanted outputs: text,
 *     watermarks, borders, drop shadows
 *
 * The existing `sprite-spec.yaml` `prompt` fields already have a lot of
 * per-key style direction ("top-down pixel art, rimworld style, ...").
 * We keep that in place as the `<key-specific description>` and add the
 * common envelope around it rather than replacing anything — subtractive
 * edits to those prompts are awfml's call, not the generator's.
 *
 * Applies the moderation-rephrase pass so the final prompt returned by
 * this module is SAFE to send to the API. Callers should log the swaps
 * for visibility.
 */

import { rephrasePrompt } from './moderation-rephrase.mjs';

const PROMPT_PREAMBLE = [
  'pixel art sprite,',
  'single tile,',
  'transparent background,',
].join(' ');

const PROMPT_TAIL = [
  'match reference image style and palette,',
  'no text, no watermark, no borders, no drop shadow,',
  'centered in frame, crisp pixel edges.',
].join(' ');

/**
 * Build a complete gpt-image-1 prompt for a given sprite-spec key.
 *
 * @param {object} spec    parsed contents of sprite-spec.yaml
 * @param {string} key     sprite-spec key (e.g. "tile.floor", "agent.crew")
 * @returns {{ prompt: string, swaps: Array, description: string }}
 *    - prompt: final text to send to the API (already moderation-rephrased)
 *    - swaps: list of rephrase substitutions applied (for manifest logging)
 *    - description: the original (pre-rephrase) per-key description
 *      (for QA tool display alongside generated output)
 */
export function buildPrompt(spec, key) {
  if (!spec || !spec.sprites || typeof spec.sprites !== 'object') {
    throw new Error('build-prompt: spec.sprites missing or malformed');
  }
  const entry = spec.sprites[key];
  if (!entry) {
    throw new Error(`build-prompt: no spec entry for key "${key}"`);
  }
  const description = (entry.prompt || '').trim();
  if (!description) {
    throw new Error(`build-prompt: spec["${key}"].prompt is empty`);
  }

  // Envelope the per-key description with the structured pre/post wrap.
  const envelope = `${PROMPT_PREAMBLE} ${description} ${PROMPT_TAIL}`;

  // Moderation rephrase. Returns the sanitized text + the swap log.
  const { text, swaps } = rephrasePrompt(envelope);

  return { prompt: text, swaps, description };
}

/**
 * List all keys in a spec. Helper for batch orchestration that wants to
 * iterate every sprite.
 *
 * @param {object} spec
 * @returns {string[]}
 */
export function listSpecKeys(spec) {
  if (!spec || !spec.sprites) return [];
  return Object.keys(spec.sprites);
}

/**
 * Filter spec keys to those in a `required-keys-*.json` profile list.
 * Mirrors the pattern in `postprocess-raw.mjs` where profile lists gate
 * which keys the pipeline processes in a given pass.
 *
 * @param {object} spec
 * @param {string[]} requiredKeys
 * @returns {string[]} subset of spec keys that are in requiredKeys AND
 *                     actually defined in the spec
 */
export function filterByProfile(spec, requiredKeys) {
  if (!spec || !spec.sprites) return [];
  if (!Array.isArray(requiredKeys)) return [];
  const present = new Set(Object.keys(spec.sprites));
  return requiredKeys.filter((k) => present.has(k));
}
