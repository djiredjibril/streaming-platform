import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { PrismaClient } from '@prisma/client';
import * as grpc from '@grpc/grpc-js';
import type { Redis as RedisClient } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// Test-only dependency on @streaming/identity: spins up the real Identity
// gRPC server instead of mocking it, so this test exercises the full
// HTTP -> gRPC -> Postgres chain. See services/gateway/README.md.
import { buildIdentityServer, startIdentityServer } from '@streaming/identity/dist/grpc/server.js';
import { createRedisClient } from '@streaming/identity/dist/infra/redisClient.js';
import { createIdentityClient } from '../../src/grpc/identityClient.js';
import { buildGatewayServer } from '../../src/http/server.js';
import { logger } from '../../src/infra/logger.js';

describe('Gateway /auth/* (real Identity gRPC server + real Postgres + real Redis)', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let prisma: PrismaClient;
  let redis: RedisClient;
  let identityServer: grpc.Server;
  let app: ReturnType<typeof buildGatewayServer>;

  beforeAll(async () => {
    [pgContainer, redisContainer] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
    ]);
    const databaseUrl = pgContainer.getConnectionUri();

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: new URL('../../../identity/', import.meta.url),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    redis = createRedisClient(redisContainer.getConnectionUrl());
    identityServer = buildIdentityServer(prisma, 'test-jwt-secret', redis);
    const identityPort = await startIdentityServer(identityServer, '127.0.0.1:0');

    const identityClient = createIdentityClient(`127.0.0.1:${identityPort}`);
    app = buildGatewayServer({ identityClient, logger });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => identityServer.tryShutdown(() => resolve()));
    await prisma.$disconnect();
    redis.disconnect();
    await pgContainer.stop();
    await redisContainer.stop();
  });

  describe('POST /auth/register', () => {
    it('creates the account end-to-end and returns it over HTTP', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'ada@example.com', password: 'correct-horse-battery', accountType: 'PERSO' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        accessToken: '',
        refreshToken: '',
        account: { email: 'ada@example.com', status: 'PENDING_VERIFICATION' },
      });

      const stored = await prisma.account.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
      expect(stored.passwordHash).not.toBe('correct-horse-battery');
    });

    it('returns 409 for a duplicate email', async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'dup@example.com', password: 'correct-horse-battery', accountType: 'PERSO' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'dup@example.com', password: 'another-password', accountType: 'PERSO' },
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe('full session lifecycle (register -> verify -> login -> me -> refresh -> logout)', () => {
    const email = 'flow@example.com';
    const password = 'correct-horse-battery';
    let currentAccessToken: string;
    let currentRefreshCookie: string;

    it('register -> account is PENDING_VERIFICATION with a verification token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password, accountType: 'PERSO' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().emailVerificationToken).toBeTruthy();

      const verifyRes = await app.inject({
        method: 'POST',
        url: '/auth/verify-email',
        payload: { token: res.json().emailVerificationToken },
      });
      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.json()).toMatchObject({ account: { status: 'ACTIVE' } });
    });

    it('login sets the refresh token cookie and returns an access token', async () => {
      const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeTruthy();
      expect(body).not.toHaveProperty('refreshToken');

      const cookie = res.cookies.find((c) => c.name === 'refresh_token');
      expect(cookie).toBeDefined();
      currentAccessToken = body.accessToken;
      currentRefreshCookie = cookie!.value;
    });

    it('me returns the account for the access token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${currentAccessToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ email, status: 'ACTIVE' });
    });

    it('me rejects a missing/invalid bearer token', async () => {
      const missing = await app.inject({ method: 'GET', url: '/auth/me' });
      expect(missing.statusCode).toBe(401);

      const invalid = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: 'Bearer not-a-real-token' },
      });
      expect(invalid.statusCode).toBe(401);
    });

    it('profiles: create rejects a client-supplied accountId, returns the token-derived one', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/profiles',
        headers: { authorization: `Bearer ${currentAccessToken}` },
        // Deliberately injects a different accountId — must be ignored (see requireAccountId in auth.ts).
        payload: { accountId: 'someone-elses-account', displayName: 'Jane', isKidsProfile: false },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ displayName: 'Jane', isKidsProfile: false });
      expect(res.json().accountId).not.toBe('someone-elses-account');
    });

    it('profiles: a second profile on this PERSO account is rejected (403)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/profiles',
        headers: { authorization: `Bearer ${currentAccessToken}` },
        payload: { displayName: 'Second', isKidsProfile: false },
      });

      expect(res.statusCode).toBe(403);
    });

    it('profiles: list returns the profile created above', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/auth/profiles',
        headers: { authorization: `Bearer ${currentAccessToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
    });

    it('profiles: rejects a missing bearer token on both routes', async () => {
      const post = await app.inject({
        method: 'POST',
        url: '/auth/profiles',
        payload: { displayName: 'Jane', isKidsProfile: false },
      });
      expect(post.statusCode).toBe(401);

      const get = await app.inject({ method: 'GET', url: '/auth/profiles' });
      expect(get.statusCode).toBe(401);
    });

    it('refresh rotates the cookie', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        cookies: { refresh_token: currentRefreshCookie },
      });

      expect(res.statusCode).toBe(200);
      const cookie = res.cookies.find((c) => c.name === 'refresh_token');
      expect(cookie?.value).toBeTruthy();
      expect(cookie?.value).not.toBe(currentRefreshCookie);
      currentRefreshCookie = cookie!.value;
    });

    it('logout revokes the session and clears the cookie', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: { refresh_token: currentRefreshCookie },
      });
      expect(res.statusCode).toBe(204);

      const refreshAfterLogout = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        cookies: { refresh_token: currentRefreshCookie },
      });
      expect(refreshAfterLogout.statusCode).toBe(401);
    });
  });
});
