import * as grpc from '@grpc/grpc-js';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { PrismaClient } from '@prisma/client';
import type { Redis as RedisClient } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildIdentityServer, startIdentityServer } from '../../src/grpc/server.js';
import { createRedisClient } from '../../src/infra/redisClient.js';
import {
  AccountType,
  IdentityServiceClient,
  type AuthResponse,
} from '../../src/grpc/generated/identity.js';
import { logger } from '../../src/infra/logger.js';

/**
 * Exercises the full account lifecycle against a single real Postgres +
 * gRPC server, one `it` per step, growing as each sub-feature (VerifyEmail,
 * Login, RefreshToken/Logout, ValidateToken/GetAccount) lands — cheaper
 * than a fresh Testcontainers instance per RPC and it's what "integration"
 * means for a session lifecycle: the steps are meant to chain.
 */
describe('Identity auth flow (real Postgres + Redis + gRPC)', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let prisma: PrismaClient;
  let redis: RedisClient;
  let server: grpc.Server;
  let client: IdentityServiceClient;
  let serverPort: number;

  beforeAll(async () => {
    [pgContainer, redisContainer] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
    ]);
    const databaseUrl = pgContainer.getConnectionUri();

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: new URL('../../', import.meta.url),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    redis = createRedisClient(redisContainer.getConnectionUrl());
    server = buildIdentityServer(prisma, 'test-jwt-secret', redis, logger);
    serverPort = await startIdentityServer(server, '127.0.0.1:0');
    client = new IdentityServiceClient(`127.0.0.1:${serverPort}`, grpc.credentials.createInsecure());
  }, 60_000);

  afterAll(async () => {
    client.close();
    await new Promise<void>((resolve) => server.tryShutdown(() => resolve()));
    await prisma.$disconnect();
    redis.disconnect();
    await pgContainer.stop();
    await redisContainer.stop();
  });

  function register(request: Parameters<IdentityServiceClient['register']>[0]) {
    return new Promise<AuthResponse>((resolve, reject) => {
      client.register(request, (error, response) => {
        if (error) reject(error);
        else resolve(response!);
      });
    });
  }

  function verifyEmail(token: string) {
    return new Promise<AuthResponse>((resolve, reject) => {
      client.verifyEmail({ token }, (error, response) => {
        if (error) reject(error);
        else resolve(response!);
      });
    });
  }

  function login(request: Parameters<IdentityServiceClient['login']>[0]) {
    return new Promise<AuthResponse>((resolve, reject) => {
      client.login(request, (error, response) => {
        if (error) reject(error);
        else resolve(response!);
      });
    });
  }

  function refreshToken(token: string) {
    return new Promise<AuthResponse>((resolve, reject) => {
      client.refreshToken({ refreshToken: token }, (error, response) => {
        if (error) reject(error);
        else resolve(response!);
      });
    });
  }

  function logout(token: string) {
    return new Promise<{ success: boolean }>((resolve, reject) => {
      client.logout({ refreshToken: token }, (error, response) => {
        if (error) reject(error);
        else resolve(response!);
      });
    });
  }

  function validateToken(token: string) {
    return new Promise<{ valid: boolean; accountId: string }>((resolve, reject) => {
      client.validateToken({ accessToken: token }, (error, response) => {
        if (error) reject(error);
        else resolve(response!);
      });
    });
  }

  function getAccountById(accountId: string) {
    return new Promise<{ id: string; email: string; status: string }>((resolve, reject) => {
      client.getAccount({ accountId }, (error, response) => {
        if (error) reject(error);
        else resolve(response! as { id: string; email: string; status: string });
      });
    });
  }

  function createProfile(request: Parameters<IdentityServiceClient['createProfile']>[0]) {
    return new Promise<{ id: string; accountId: string; displayName: string; isKidsProfile: boolean }>(
      (resolve, reject) => {
        client.createProfile(request, (error, response) => {
          if (error) reject(error);
          else resolve(response as unknown as { id: string; accountId: string; displayName: string; isKidsProfile: boolean });
        });
      },
    );
  }

  function listProfiles(accountId: string) {
    return new Promise<{ profiles: unknown[] }>((resolve, reject) => {
      client.listProfiles({ accountId }, (error, response) => {
        if (error) reject(error);
        else resolve(response!);
      });
    });
  }

  const email = 'flow@example.com';
  let emailVerificationToken: string;

  it('register -> account is PENDING_VERIFICATION with a verification token', async () => {
    const response = await register({
      email,
      password: 'correct-horse-battery',
      accountType: AccountType.PERSO,
    });

    expect(response.account?.status).toBe('PENDING_VERIFICATION');
    expect(response.emailVerificationToken).toBeTruthy();
    emailVerificationToken = response.emailVerificationToken!;
  });

  it('verifyEmail -> account becomes ACTIVE, still no session', async () => {
    const response = await verifyEmail(emailVerificationToken);

    expect(response.account?.status).toBe('ACTIVE');
    expect(response.accessToken).toBe('');
    expect(response.refreshToken).toBe('');

    const stored = await prisma.account.findUniqueOrThrow({ where: { email } });
    expect(stored.emailVerificationTokenHash).toBeNull();
  });

  it('verifyEmail rejects an already-used token', async () => {
    await expect(verifyEmail(emailVerificationToken)).rejects.toMatchObject({
      code: grpc.status.INVALID_ARGUMENT,
    });
  });

  it('verifyEmail rejects an unknown token', async () => {
    await expect(verifyEmail('deadbeef'.repeat(8))).rejects.toMatchObject({
      code: grpc.status.INVALID_ARGUMENT,
    });
  });

  const password = 'correct-horse-battery';
  let currentRefreshToken: string;

  it('login issues an access token + refresh token now that the account is ACTIVE', async () => {
    const response = await login({ email, password });

    expect(response.account?.status).toBe('ACTIVE');
    expect(response.accessToken).toBeTruthy();
    expect(response.refreshToken).toBeTruthy();
    currentRefreshToken = response.refreshToken;

    const tokens = await prisma.refreshToken.findMany({ where: { account: { email } } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.tokenHash).not.toBe(response.refreshToken);
  });

  it('login rejects a wrong password and records a LOGIN_FAILED audit event', async () => {
    await expect(login({ email, password: 'wrong-password' })).rejects.toMatchObject({
      code: grpc.status.UNAUTHENTICATED,
    });

    const events = await prisma.auditLog.findMany({
      where: { account: { email } },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.some((e) => e.eventType === 'LOGIN_FAILED')).toBe(true);
  });

  it('login rejects a still-pending account', async () => {
    await register({
      email: 'never-verified@example.com',
      password,
      accountType: AccountType.PERSO,
    });

    await expect(login({ email: 'never-verified@example.com', password })).rejects.toMatchObject({
      code: grpc.status.FAILED_PRECONDITION,
    });
  });

  it('refreshToken rotates: old token revoked, new one issued', async () => {
    const response = await refreshToken(currentRefreshToken);

    expect(response.accessToken).toBeTruthy();
    expect(response.refreshToken).not.toBe(currentRefreshToken);

    const tokens = await prisma.refreshToken.findMany({ where: { account: { email } } });
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((t) => t.revokedAt)).toHaveLength(1);

    currentRefreshToken = response.refreshToken;
  });

  it('reusing the just-rotated (now revoked) token is detected as theft', async () => {
    await refreshToken(currentRefreshToken); // rotates it once -> currentRefreshToken is now revoked

    await expect(refreshToken(currentRefreshToken)).rejects.toMatchObject({
      code: grpc.status.UNAUTHENTICATED,
    });

    const tokens = await prisma.refreshToken.findMany({ where: { account: { email } } });
    expect(tokens.every((t) => t.revokedAt)).toBe(true);

    const events = await prisma.auditLog.findMany({ where: { account: { email }, eventType: 'TOKEN_REVOKED' } });
    expect(events.length).toBeGreaterThan(0);
  });

  let currentAccessToken: string;
  let accountId: string;

  it('login again to get a fresh session', async () => {
    const response = await login({ email, password });
    currentRefreshToken = response.refreshToken;
    currentAccessToken = response.accessToken;
    accountId = response.account!.id;
  });

  it('validateToken accepts a fresh access token', async () => {
    const response = await validateToken(currentAccessToken);

    expect(response.valid).toBe(true);
    expect(response.accountId).toBe(accountId);
  });

  it('validateToken rejects garbage input without a gRPC error', async () => {
    const response = await validateToken('not-a-real-jwt');
    expect(response.valid).toBe(false);
  });

  it('getAccount returns the account by id', async () => {
    const account = await getAccountById(accountId);
    expect(account.email).toBe(email);
    expect(account.status).toBe('ACTIVE');
  });

  it('getAccount rejects an unknown id with NOT_FOUND', async () => {
    await expect(getAccountById('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      code: grpc.status.NOT_FOUND,
    });
  });

  it('createProfile assigns OWNER to the first profile', async () => {
    const profile = await createProfile({ accountId, displayName: 'Jane', isKidsProfile: false });

    expect(profile.accountId).toBe(accountId);
    expect(profile.displayName).toBe('Jane');

    const stored = await prisma.profileRole.findMany({
      where: { profile: { accountId } },
      include: { role: true },
    });
    expect(stored.map((r) => r.role.name)).toEqual(['OWNER']);
  });

  it('createProfile rejects a second profile on this PERSO account', async () => {
    await expect(createProfile({ accountId, displayName: 'Second', isKidsProfile: false })).rejects.toMatchObject({
      code: grpc.status.FAILED_PRECONDITION,
    });
  });

  it('listProfiles returns the profile created above', async () => {
    const response = await listProfiles(accountId);
    expect(response.profiles).toHaveLength(1);
  });

  it('logout revokes the refresh token', async () => {
    await expect(logout(currentRefreshToken)).resolves.toMatchObject({ success: true });

    await expect(refreshToken(currentRefreshToken)).rejects.toMatchObject({
      code: grpc.status.UNAUTHENTICATED,
    });
  });

  it('logout is idempotent for an unknown token', async () => {
    await expect(logout('never-issued-token')).resolves.toMatchObject({ success: true });
  });

  describe('rate limiting', () => {
    // Explicit x-client-ip metadata (same mechanism the Gateway uses in
    // production, see grpc/clientIp.ts) with a fake IP unique to this
    // block, so these attempts don't eat into (or get blocked by) the
    // budget the lifecycle tests above already spent on the shared
    // `client` connection's own peer address.
    function withFakeIp(ip: string): grpc.Metadata {
      const metadata = new grpc.Metadata();
      metadata.set('x-client-ip', ip);
      return metadata;
    }

    it('register: the 6th attempt within the window returns RESOURCE_EXHAUSTED', async () => {
      const ip = '203.0.113.10';
      for (let i = 0; i < 5; i++) {
        await new Promise<void>((resolve, reject) => {
          client.register(
            { email: `ratelimit${i}@example.com`, password: 'correct-horse-battery', accountType: AccountType.PERSO },
            withFakeIp(ip),
            (error) => (error ? reject(error) : resolve()),
          );
        });
      }

      await new Promise<void>((resolve, reject) => {
        client.register(
          { email: 'ratelimit5@example.com', password: 'correct-horse-battery', accountType: AccountType.PERSO },
          withFakeIp(ip),
          (error) =>
            error?.code === grpc.status.RESOURCE_EXHAUSTED
              ? resolve()
              : reject(error ?? new Error('expected the 6th register to be rate-limited')),
        );
      });
    });

    it('login: the 6th attempt within the window returns RESOURCE_EXHAUSTED, even with the wrong password every time', async () => {
      const ip = '203.0.113.20';
      for (let i = 0; i < 5; i++) {
        await new Promise<void>((resolve, reject) => {
          client.login({ email: 'nobody@example.com', password: 'wrong' }, withFakeIp(ip), (error) =>
            error?.code === grpc.status.UNAUTHENTICATED ? resolve() : reject(error ?? new Error('expected UNAUTHENTICATED')),
          );
        });
      }

      await new Promise<void>((resolve, reject) => {
        client.login({ email: 'nobody@example.com', password: 'wrong' }, withFakeIp(ip), (error) =>
          error?.code === grpc.status.RESOURCE_EXHAUSTED
            ? resolve()
            : reject(error ?? new Error('expected RESOURCE_EXHAUSTED on the 6th attempt')),
        );
      });
    });
  });
});
