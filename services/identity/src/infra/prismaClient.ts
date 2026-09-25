import { PrismaClient } from '../../generated/prisma-client/index.js';

export type { PrismaClient };

/** Process-wide Prisma client, reads `DATABASE_URL`. Tests build their own PrismaClient against a Testcontainers instance instead of using this singleton. */
export const prisma = new PrismaClient();

/**
 * Builds a PrismaClient against an explicit URL rather than `DATABASE_URL`
 * — for Testcontainers-backed tests, including the Gateway's own
 * integration test (services/gateway/tests/integration/authFlow.http.test.ts),
 * which needs an Identity-shaped Prisma client but must not import it
 * directly itself: this service's generated client lives at
 * services/identity/generated/prisma-client (see schema.prisma's
 * `output`), a path only resolvable from inside this service.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}
