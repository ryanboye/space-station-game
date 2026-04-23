/**
 * OpenAI gpt-image-1 rate-limit knowledge.
 *
 * Shared between `generate-gpt-image.mjs` (obeys these limits when firing
 * requests) and `qa-review.mjs` (shows an ETA banner to the reviewer based
 * on batch size + current tier). ONE source of truth so neither side drifts.
 *
 * Source: seb's research in the claws group, 2026-04-23. Pulled from
 * OpenAI's own rate-limit docs + model-specific quirks. gpt-image-1 has
 * its own bucket separate from the text models.
 *
 * Correction history (kept so the table stays honest):
 *  - Initial estimate said `/v1/batches` ≈ 2 min for 111 tiles. WRONG:
 *    `/v1/batches` is 24-hour async + 50% discount; use it for overnight
 *    full-atlas runs, not interactive loops. The live QA loop fires
 *    `/v1/images/edits` synchronously, parallelizable up to the per-minute
 *    rate limit.
 *  - "10× parallelism" is a rate-limit-tier unlock, not a client-concurrency
 *    knob. OpenAI will 429 any concurrent requests that exceed the bucket.
 */

export const TIER_LIMITS = {
  1: { rpm: 5,   daily: 50   }, // starting tier — <$5 lifetime spend
  2: { rpm: 50,  daily: 500  }, // unlocks at >$50 lifetime + 7d
  3: { rpm: 500, daily: 5000 }, // >$100 + 7d, usually rubber-stamped
  4: { rpm: 1500, daily: null }, // enterprise / support-ticket only
};

/** Per-request latency on `/v1/images/edits` with gpt-image-1 (seconds). */
export const REQUEST_LATENCY_SECONDS = 8; // median; range ~5-12s

/** How long before we give up on a request (ms). OpenAI occasionally drops
 * long-running connections around the 60s mark — pad to 90s. */
export const REQUEST_TIMEOUT_MS = 90_000;

/** If the 429 has no `retry-after` header, wait this long before retrying. */
export const RETRY_AFTER_DEFAULT_SECONDS = 30;

/** Backoff retry count for transient rate-limit 429s (not moderation 400s). */
export const RATE_429_RETRIES = 6;

/** Moderation 400s (`content_policy_violation`) are NOT retried in-place —
 * they bubble up so the caller can rephrase the prompt and try again. */
export const MODERATION_RETRIES = 0;

/**
 * Estimate wall-clock seconds to generate `tileCount` tiles at a given
 * rate-limit tier, assuming max parallelism up to the rpm cap.
 *
 * Formula: throughput-bound (rpm) dominates for batches larger than one
 * minute of throughput. For small batches we fall back to sequential
 * latency.
 */
export function estimateDuration(tileCount, tier) {
  const limits = TIER_LIMITS[tier];
  if (!limits) throw new Error(`unknown tier: ${tier}`);
  const { rpm, daily } = limits;
  if (daily !== null && tileCount > daily) {
    // Can't finish in a single day at this tier.
    return { seconds: Infinity, bound: 'daily', reason: `tileCount ${tileCount} exceeds daily cap ${daily}` };
  }
  // Throughput model: one "slot" fires every (60 / rpm) seconds.
  const slotSeconds = 60 / rpm;
  // Total wall time: (tileCount - 1) slots + the last request's own latency.
  // For very small tileCount, sequential latency dominates.
  const throughputTime = Math.max(0, tileCount - 1) * slotSeconds + REQUEST_LATENCY_SECONDS;
  const sequentialTime = tileCount * REQUEST_LATENCY_SECONDS;
  const seconds = Math.min(throughputTime, sequentialTime); // parallelism helps, never hurts
  return { seconds, bound: tileCount - 1 > REQUEST_LATENCY_SECONDS / slotSeconds ? 'rpm' : 'latency', reason: null };
}

/**
 * Human-readable throughput label for the QA tool's ETA banner.
 * Example: `throughputLabel(111, 2)` → `"~3 min (tier-2)"`.
 */
export function throughputLabel(tileCount, tier) {
  const { seconds, bound, reason } = estimateDuration(tileCount, tier);
  if (!isFinite(seconds)) {
    return `blocked — ${reason}`;
  }
  let label;
  if (seconds < 60) {
    label = `~${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    label = `~${Math.round(seconds / 60)} min`;
  } else {
    label = `~${(seconds / 3600).toFixed(1)} hr`;
  }
  return `${label} (tier-${tier}, ${bound}-bound)`;
}

/**
 * Parse an OpenAI 429 response to classify the rate-limit bucket.
 * Returns `'requests' | 'tokens' | 'images' | 'unknown'`. The caller uses
 * this to decide whether to back off globally (requests, images) or
 * per-endpoint (tokens).
 */
export function classify429Bucket(errorBody) {
  const code = errorBody?.error?.code || '';
  const msg = errorBody?.error?.message || '';
  if (code === 'rate_limit_exceeded' || /requests per minute/i.test(msg)) return 'requests';
  if (/tokens per minute/i.test(msg)) return 'tokens';
  if (/images per (minute|day)/i.test(msg)) return 'images';
  return 'unknown';
}

/**
 * Parse the `retry-after` header (OpenAI returns integer or float seconds).
 * Falls back to `RETRY_AFTER_DEFAULT_SECONDS` if the header is missing or
 * unparseable.
 */
export function parseRetryAfter(headers) {
  const raw = headers?.get?.('retry-after') ?? headers?.['retry-after'];
  if (raw === undefined || raw === null) return RETRY_AFTER_DEFAULT_SECONDS;
  const parsed = Number(raw);
  if (!isFinite(parsed) || parsed < 0) return RETRY_AFTER_DEFAULT_SECONDS;
  return parsed;
}

/**
 * Exponential backoff with jitter for transient 429s.
 * attempt is 0-indexed. Returns milliseconds to wait.
 */
export function backoffMs(attempt) {
  const base = Math.min(60, 2 ** attempt); // cap at 60s
  const jitter = 1 + (Math.random() - 0.5) * 0.4; // ±20%
  return Math.round(base * jitter * 1000);
}
