export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller can retry — only meaningful when `allowed` is false. */
  retryAfterSeconds: number;
}

/**
 * Port implemented by the Redis-backed adapter in /infra. Fixed-window
 * counter: `consume` increments the count for `key` within the current
 * `windowSeconds` bucket and reports whether it's still under `limit`.
 */
export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}
