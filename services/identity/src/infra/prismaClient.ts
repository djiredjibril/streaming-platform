import { PrismaClient } from '@prisma/client';

/** Process-wide Prisma client, reads `DATABASE_URL`. Tests build their own PrismaClient against a Testcontainers instance instead of using this singleton. */
export const prisma = new PrismaClient();
