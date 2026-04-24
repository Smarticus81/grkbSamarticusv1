/**
 * In-process token-bucket rate limiter for MCP HTTP enterprise mode.
 *
 * Uses an LRU Map by default. If REDIS_URL is set, a future version
 * will use Redis for distributed rate limiting across instances.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  remaining: number;
}

export class RateLimiter {
  /** tenantId -> bucket */
  private buckets: Map<string, Bucket> = new Map();

  /** Maximum number of tracked tenants (LRU eviction) */
  private readonly maxBuckets: number;

  /** Refill interval in milliseconds (1 minute) */
  private readonly refillIntervalMs: number;

  constructor(options?: { maxBuckets?: number; refillIntervalMs?: number }) {
    this.maxBuckets = options?.maxBuckets ?? 10_000;
    this.refillIntervalMs = options?.refillIntervalMs ?? 60_000;
  }

  /**
   * Check whether a request from this tenant is allowed under their rate limit.
   * Does NOT consume a token — call `consume()` after the check passes and
   * before processing.
   */
  check(tenantId: string, limit: number): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(tenantId);

    if (!bucket) {
      // First request from this tenant — full bucket
      return { allowed: true, remaining: limit };
    }

    // Refill tokens based on elapsed time
    bucket = this.refill(bucket, limit, now);
    this.buckets.set(tenantId, bucket);

    if (bucket.tokens > 0) {
      return { allowed: true, remaining: bucket.tokens };
    }

    // Denied — calculate retry-after
    const msUntilRefill = this.refillIntervalMs - (now - bucket.lastRefill);
    return {
      allowed: false,
      retryAfterMs: Math.max(msUntilRefill, 1000),
      remaining: 0,
    };
  }

  /**
   * Consume one token for the given tenant.
   * Call this after `check()` returns `allowed: true`.
   */
  consume(tenantId: string, limit: number): void {
    const now = Date.now();
    let bucket = this.buckets.get(tenantId);

    if (!bucket) {
      bucket = { tokens: limit - 1, lastRefill: now };
    } else {
      bucket = this.refill(bucket, limit, now);
      bucket.tokens = Math.max(0, bucket.tokens - 1);
    }

    this.buckets.set(tenantId, bucket);
    this.evictIfNeeded();
  }

  /**
   * Refill a bucket based on elapsed time.
   */
  private refill(bucket: Bucket, limit: number, now: number): Bucket {
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= this.refillIntervalMs) {
      // Full refill — one or more intervals have passed
      const intervals = Math.floor(elapsed / this.refillIntervalMs);
      const tokensToAdd = intervals * limit;
      return {
        tokens: Math.min(limit, bucket.tokens + tokensToAdd),
        lastRefill: bucket.lastRefill + intervals * this.refillIntervalMs,
      };
    }
    return bucket;
  }

  /**
   * Evict oldest entries if we exceed maxBuckets (simple LRU by insertion order).
   */
  private evictIfNeeded(): void {
    if (this.buckets.size <= this.maxBuckets) return;

    // Map iteration order is insertion order — delete the first (oldest) entries
    const toDelete = this.buckets.size - this.maxBuckets;
    let deleted = 0;
    for (const key of this.buckets.keys()) {
      if (deleted >= toDelete) break;
      this.buckets.delete(key);
      deleted++;
    }
  }

  /**
   * Clear all buckets (for testing).
   */
  reset(): void {
    this.buckets.clear();
  }
}
