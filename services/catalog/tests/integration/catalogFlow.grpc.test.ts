import * as grpc from '@grpc/grpc-js';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '../../generated/prisma-client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCatalogServer, startCatalogServer } from '../../src/grpc/server.js';
import {
  CatalogServiceClient,
  ContentRating,
  TitleStatus,
  TitleType,
  type Title,
} from '../../src/grpc/generated/catalog.js';

/**
 * Exercises the full CreateTitle -> GetTitleBySlug flow against a real
 * Postgres + gRPC server (services/AGENT.md §4: no DB mocking for
 * integration tests). Publishing isn't a feature yet (no mutation for it —
 * see domain/getTitleBySlug.ts) so this test flips `status` directly via
 * Prisma to simulate it, the same pattern used for the admin-role
 * integration test in services/identity.
 */
describe('CatalogService (real Postgres + gRPC)', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let server: grpc.Server;
  let client: CatalogServiceClient;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    const databaseUrl = pgContainer.getConnectionUri();

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: new URL('../../', import.meta.url),
      env: { ...process.env, CATALOG_DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    server = buildCatalogServer(prisma);
    const port = await startCatalogServer(server, '127.0.0.1:0');
    client = new CatalogServiceClient(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
  }, 60_000);

  afterAll(async () => {
    client.close();
    await new Promise<void>((resolve) => server.tryShutdown(() => resolve()));
    await prisma.$disconnect();
    await pgContainer.stop();
  });

  function createTitle(request: Parameters<CatalogServiceClient['createTitle']>[0]) {
    return new Promise<Title>((resolve, reject) => {
      client.createTitle(request, (error, response) => {
        if (error) reject(error);
        else resolve(response!);
      });
    });
  }

  function getTitleBySlug(slug: string) {
    return new Promise<Title>((resolve, reject) => {
      client.getTitleBySlug({ slug }, (error, response) => {
        if (error) reject(error);
        else resolve(response!);
      });
    });
  }

  const movieInput = {
    type: TitleType.MOVIE,
    originalTitle: 'The Matrix',
    synopsis: 'A hacker discovers reality is a simulation.',
    releaseYear: 1999,
    rating: ContentRating.R,
    runtimeMinutes: 136,
  };

  it('createTitle creates a DRAFT title with a derived slug', async () => {
    const title = await createTitle(movieInput);

    expect(title.slug).toBe('the-matrix-1999');
    expect(title.status).toBe(TitleStatus.DRAFT);
  });

  it('createTitle rejects a duplicate slug with ALREADY_EXISTS', async () => {
    await expect(createTitle(movieInput)).rejects.toMatchObject({ code: grpc.status.ALREADY_EXISTS });
  });

  it('createTitle rejects invalid input with INVALID_ARGUMENT', async () => {
    await expect(createTitle({ ...movieInput, originalTitle: '' })).rejects.toMatchObject({
      code: grpc.status.INVALID_ARGUMENT,
    });
  });

  it('getTitleBySlug returns NOT_FOUND for the DRAFT title just created (never expose unpublished content)', async () => {
    await expect(getTitleBySlug('the-matrix-1999')).rejects.toMatchObject({ code: grpc.status.NOT_FOUND });
  });

  it('getTitleBySlug returns NOT_FOUND for an unknown slug', async () => {
    await expect(getTitleBySlug('does-not-exist')).rejects.toMatchObject({ code: grpc.status.NOT_FOUND });
  });

  it('getTitleBySlug returns the title once published', async () => {
    await prisma.title.update({ where: { slug: 'the-matrix-1999' }, data: { status: 'PUBLISHED' } });

    const title = await getTitleBySlug('the-matrix-1999');
    expect(title.originalTitle).toBe('The Matrix');
    expect(title.status).toBe(TitleStatus.PUBLISHED);
    expect(title.runtimeMinutes).toBe(136);
  });
});
