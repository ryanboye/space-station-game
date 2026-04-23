/**
 * OpenAI gpt-image-2 rate-limit knowledge.
 *
 * Shared between `generate-gpt-image.mjs` (obeys these limits when firing
 * requests) and `qa-review.mjs` (shows an ETA banner to the reviewer based
 * on batch size + current tier). ONE source of truth so neither side drifts.
 *
 * Source: OpenAI's docs at
 * https://developers.openai.com/api/docs/models/gpt-image-2 , pulled
 * 2026-04-23 after awfml flagged that the earlier numbers were from
 * gpt-image-1 (different bucket, different pricing).
 *
 * Correction history (kept so the table stays honest):
 *  - Initial numbers were for gpt-image-1. Model was swapped: image-2
 *    shipped 2026-04-21 with DIFFERENT per-minute limits and, crucially,
 *    NO DAILY CAP. The daily gate that used to block tier-1 bulk runs is
 *    gone; throughput is purely IPM-bound.
 *  - `/v1/batches` is 24-hour async + 50% discount; use it for overnight
 *    full-atlas runs, not interactive loops. The live QA loop fires
 *    `/v1/images/edits` synchronously, parallelizable up to the per-minute
 *    rate limit.
 *  - image-2's IPM ceilings are LOWER than image-1 at equivalent tiers
 *    (tier-2 dropped from 50 rpm → 20 ipm). Bulk atlas passes are ~3×
 *    slower than image-1 numbers suggested, still workable.
 */

/**
 * gpt-image-2 rate-limit buckets.
 *   ipm — images per minute (hard ceiling on request rate for this model)
 *   tpm — tokens per minute (image-2 is token-priced; this caps spend-rate)
 *
 * Tiers auto-promote based on lifetime API spend + account age:
 *   Tier 1: starting. 5 ipm makes large batches painful.
 *   Tier 2: >$50 lifetime + 7 days. Most users land here within a week.
 *   Tier 3+: >$100 + 7d; higher tiers effectively enterprise/support-ticket.
 */
export const TIER_LIMITS = {
  1: { ipm: 5,   tpm: 100_000   },
  2: { ipm: 20,  tpm: 250_000   },
  3: { ipm: 50,  tpm: 800_000   },
  4: { ipm: 150, tpm: 3_000_000 },
  5: { ipm: 250, tpm: 8_000_000 },
};

/**
 * gpt-image-2 pricing per-image cost placeholder.
 *
 * TODO: replace with real numbers once the first generation call succeeds.
 * gpt-image-2 is TOKEN-priced, not per-image — the actual cost depends on
 * image size + quality. Derive from the `usage` field of the first
 * successful API response and update this table.
 *
 * Rough order-of-magnitude guesses (based on gpt-image-1 numbers, likely
 * within 2-3× of image-2 reality at medium quality):
 *   low:    ~$0.01/image
 *   medium: ~$0.04-0.06/image
 *   high:   ~$0.10-0.17/image
 * These feed the QA tool's "estimated batch cost" banner; surface them as
 * "approximate" until we lock real numbers.
 */
export const QUALITY_COST_PER_IMAGE_USD = {
  low: 0.01,     // placeholder
  medium: 0.05,  // placeholder
  high: 0.15,    // placeholder
};
export const QUALITY_COST_NOTE = 'placeholder — update from first real API response usage field';

/** Per-request latency on `/v1/images/edits` with gpt-image-2 (seconds). */
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
 * rate-limit tier, assuming max parallelism up to the ipm cap.
 *
 * Formula: throughput-bound (ipm) dominates for batches larger than one
 * minute of throughput. For small batches we fall back to sequential
 * latency. image-2 has no daily cap, so the only bound is per-minute.
 */
export function estimateDuration(tileCount, tier) {
  const limits = TIER_LIMITS[tier];
  if (!limits) throw new Error(`unknown tier: ${tier}`);
  const { ipm } = limits;
  // Throughput model: one "slot" fires every (60 / ipm) seconds.
  const slotSeconds = 60 / ipm;
  // Total wall time: (tileCount - 1) slots + the last request's own latency.
  // For very small tileCount, sequential latency dominates.
  const throughputTime = Math.max(0, tileCount - 1) * slotSeconds + REQUEST_LATENCY_SECONDS;
  const sequentialTime = tileCount * REQUEST_LATENCY_SECONDS;
  const seconds = Math.min(throughputTime, sequentialTime); // parallelism helps, never hurts
  return { seconds, bound: tileCount - 1 > REQUEST_LATENCY_SECONDS / slotSeconds ? 'ipm' : 'latency', reason: null };
}

/**
 * Estimate total USD cost for a batch at given quality.
 * Returns { usd, note } — `note` flags "approximate" until real numbers land.
 */
export function estimateCostUsd(tileCount, quality = 'medium') {
  const unit = QUALITY_COST_PER_IMAGE_USD[quality];
  if (unit === undefined) throw new Error(`unknown quality: ${quality}`);
  return { usd: tileCount * unit, note: QUALITY_COST_NOTE };
}

/**
 * Human-readable throughput label for the QA tool's ETA banner.
 * Example: `throughputLabel(111, 2)` → `"~6 min (tier-2, ipm-bound)"`.
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
  if (/images per minute/i.test(msg)) return 'images';
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
