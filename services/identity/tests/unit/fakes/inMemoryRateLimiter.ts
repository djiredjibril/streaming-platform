import type { RateLimitResult, RateLimiter } from '../../../src/domain/rateLimiter.js';

/** In-memory fake for unit-testing /domain functions without a real Redis. Same fixed-window semantics as RedisRateLimiter, minus the TTL imprecision (not relevant for deterministic unit tests). */
export class InMemoryRateLimiter implements RateLimiter {
  private counts = new Map<string, number>();

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    void windowSeconds; // Not needed: this fake never expires entries (see `reset()`), unlike the real Redis-backed limiter.
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    if (count > limit) {
      return { allowed: false, retryAfterSeconds: 1 };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Test-only helper to reset between scenarios within the same test file. */
  reset(): void {
    this.counts.clear();
  }
}
