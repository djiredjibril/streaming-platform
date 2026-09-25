import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import * as grpc from '@grpc/grpc-js';
import type { Redis as RedisClient } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// Test-only dependency on @streaming/identity and @streaming/catalog: spins
// up both real gRPC servers instead of mocking them, so this test exercises
// the full HTTP -> GraphQL -> gRPC -> Postgres chain for both domains a
// createTitle request touches. See services/gateway/README.md.
import { buildIdentityServer, startIdentityServer } from '@streaming/identity/dist/grpc/server.js';
import { createPrismaClient as createIdentityPrismaClient } from '@streaming/identity/dist/infra/prismaClient.js';
import { createRedisClient } from '@streaming/identity/dist/infra/redisClient.js';
import { buildCatalogServer, startCatalogServer } from '@streaming/catalog/dist/grpc/server.js';
import { createPrismaClient as createCatalogPrismaClient } from '@streaming/catalog/dist/infra/prismaClient.js';
import { createCatalogClient } from '../../src/grpc/catalogClient.js';
import { createIdentityClient } from '../../src/grpc/identityClient.js';
import { buildGatewayServer } from '../../src/http/server.js';
import { logger } from '../../src/infra/logger.js';

describe('GraphQL /graphql (real Identity + Catalog gRPC servers + real Postgres + real Redis)', () => {
  let identityPgContainer: StartedPostgreSqlContainer;
  let catalogPgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let identityPrisma: ReturnType<typeof createIdentityPrismaClient>;
  let catalogPrisma: ReturnType<typeof createCatalogPrismaClient>;
  let redis: RedisClient;
  let identityServer: grpc.Server;
  let catalogServer: grpc.Server;
  let app: ReturnType<typeof buildGatewayServer>;

  beforeAll(async () => {
    [identityPgContainer, catalogPgContainer, redisContainer] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
    ]);

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: new URL('../../../identity/', import.meta.url),
      env: { ...process.env, DATABASE_URL: identityPgContainer.getConnectionUri() },
      stdio: 'inherit',
    });
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: new URL('../../../catalog/', import.meta.url),
      env: { ...process.env, CATALOG_DATABASE_URL: catalogPgContainer.getConnectionUri() },
      stdio: 'inherit',
    });

    identityPrisma = createIdentityPrismaClient(identityPgContainer.getConnectionUri());
    catalogPrisma = createCatalogPrismaClient(catalogPgContainer.getConnectionUri());
    redis = createRedisClient(redisContainer.getConnectionUrl());

    identityServer = buildIdentityServer(identityPrisma, 'test-jwt-secret', redis);
    catalogServer = buildCatalogServer(catalogPrisma);
    const [identityPort, catalogPort] = await Promise.all([
      startIdentityServer(identityServer, '127.0.0.1:0'),
      startCatalogServer(catalogServer, '127.0.0.1:0'),
    ]);

    const identityClient = createIdentityClient(`127.0.0.1:${identityPort}`);
    const catalogClient = createCatalogClient(`127.0.0.1:${catalogPort}`);
    app = buildGatewayServer({ identityClient, catalogClient, logger });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await Promise.all([
      new Promise<void>((resolve) => identityServer.tryShutdown(() => resolve())),
      new Promise<void>((resolve) => catalogServer.tryShutdown(() => resolve())),
    ]);
    await identityPrisma.$disconnect();
    await catalogPrisma.$disconnect();
    redis.disconnect();
    await identityPgContainer.stop();
    await catalogPgContainer.stop();
    await redisContainer.stop();
  });

  async function graphql(query: string, variables?: Record<string, unknown>, headers?: Record<string, string>) {
    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { 'content-type': 'application/json', ...headers },
      payload: { query, variables },
    });
    return res.json();
  }

  async function registerAndGetAdminToken(): Promise<string> {
    const email = `admin-${Date.now()}@example.com`;
    const password = 'correct-horse-battery';
    const registerRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password, accountType: 'PERSO' },
    });
    const { emailVerificationToken } = registerRes.json();
    await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token: emailVerificationToken } });

    const accountId = (await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    })).json().account.id;
    await identityPrisma.account.update({ where: { id: accountId }, data: { isAdmin: true } });

    // Admin promotion only takes effect on the NEXT login (docs/01-identity.md) — see services/identity's admin-role feature.
    const loginRes = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
    return loginRes.json().accessToken;
  }

  const CREATE_TITLE_MUTATION = `
    mutation($input: CreateTitleInput!) {
      createTitle(input: $input) { id slug status: originalTitle }
    }
  `;

  it('createTitle rejects an unauthenticated request', async () => {
    const body = await graphql(CREATE_TITLE_MUTATION, {
      input: { type: 'MOVIE', originalTitle: 'X', synopsis: 'Y', releaseYear: 2020, rating: 'PG', runtimeMinutes: 90 },
    });

    expect(body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('createTitle rejects a non-admin account', async () => {
    const registerRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `regular-${Date.now()}@example.com`, password: 'correct-horse-battery', accountType: 'PERSO' },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: registerRes.json().emailVerificationToken },
    });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: registerRes.json().account.email, password: 'correct-horse-battery' },
    });

    const body = await graphql(
      CREATE_TITLE_MUTATION,
      { input: { type: 'MOVIE', originalTitle: 'X', synopsis: 'Y', releaseYear: 2020, rating: 'PG', runtimeMinutes: 90 } },
      { authorization: `Bearer ${loginRes.json().accessToken}` },
    );

    expect(body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('createTitle creates a DRAFT title for an admin account, and title(slug) is null until published', async () => {
    const accessToken = await registerAndGetAdminToken();

    const createBody = await graphql(
      CREATE_TITLE_MUTATION,
      {
        input: {
          type: 'MOVIE',
          originalTitle: 'The Matrix',
          synopsis: 'A hacker discovers reality is a simulation.',
          releaseYear: 1999,
          rating: 'R',
          runtimeMinutes: 136,
        },
      },
      { authorization: `Bearer ${accessToken}` },
    );

    expect(createBody.errors).toBeUndefined();
    expect(createBody.data.createTitle.slug).toBe('the-matrix-1999');

    const draftQuery = await graphql('query($slug: String!) { title(slug: $slug) { id } }', {
      slug: 'the-matrix-1999',
    });
    expect(draftQuery.data.title).toBeNull();

    await catalogPrisma.title.update({ where: { slug: 'the-matrix-1999' }, data: { status: 'PUBLISHED' } });

    const publishedQuery = await graphql('query($slug: String!) { title(slug: $slug) { originalTitle rating } }', {
      slug: 'the-matrix-1999',
    });
    expect(publishedQuery.data.title).toEqual({ originalTitle: 'The Matrix', rating: 'R' });
  });
});
