import { Redis } from 'ioredis';

/**
 * Builds a Redis client. `url` is injected (rather than read from env here)
 * so tests can point it at a Testcontainers instance instead of the real
 * one — same reasoning as grpc/identityClient.ts's createIdentityClient on
 * the Gateway side.
 */
export function createRedisClient(url: string): Redis {
  return new Redis(url);
}
