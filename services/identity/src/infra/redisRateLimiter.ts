import type { Redis } from 'ioredis';
import type { RateLimitResult, RateLimiter } from '../domain/rateLimiter.js';

/**
 * Fixed-window counter: INCR the key, EXPIRE it only on the first hit of
 * the window. Known imprecision (accepted, not a hidden bug): a caller can
 * burst up to `limit` requests right at the window boundary and another
 * `limit` right after it resets, briefly allowing ~2x the nominal rate.
 * Good enough for this project's brute-force-deterrence goal; a sliding
 * window or token bucket would remove that if it ever needs tightening.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }

    if (count > limit) {
      const ttl = await this.redis.ttl(key);
      return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
