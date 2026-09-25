import { PrismaClient } from '@prisma/client';

export type { PrismaClient };

/** Process-wide Prisma client, reads `CATALOG_DATABASE_URL`. Tests build their own PrismaClient against a Testcontainers instance instead of using this singleton. */
export const prisma = new PrismaClient();

/**
 * Builds a PrismaClient against an explicit URL rather than
 * `CATALOG_DATABASE_URL` — for Testcontainers-backed tests, including the
 * Gateway's own GraphQL integration test, which needs a Catalog-shaped
 * Prisma client but must not import `@prisma/client` directly itself: this
 * service's generated client lives at
 * services/catalog/node_modules/@prisma/client (see schema.prisma's
 * `output`), a path only resolvable from inside this service. Same shape
 * as services/identity/src/infra/prismaClient.ts's createPrismaClient.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}
