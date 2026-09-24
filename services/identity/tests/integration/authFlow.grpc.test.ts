import * as grpc from '@grpc/grpc-js';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildIdentityServer, startIdentityServer } from '../../src/grpc/server.js';
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
describe('Identity auth flow (real Postgres + gRPC)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let server: grpc.Server;
  let client: IdentityServiceClient;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const databaseUrl = container.getConnectionUri();

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: new URL('../../', import.meta.url),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    server = buildIdentityServer(prisma, 'test-jwt-secret', logger);
    const port = await startIdentityServer(server, '127.0.0.1:0');
    client = new IdentityServiceClient(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
  }, 60_000);

  afterAll(async () => {
    client.close();
    await new Promise<void>((resolve) => server.tryShutdown(() => resolve()));
    await prisma.$disconnect();
    await container.stop();
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

  it('login issues an access token + refresh token now that the account is ACTIVE', async () => {
    const response = await login({ email, password });

    expect(response.account?.status).toBe('ACTIVE');
    expect(response.accessToken).toBeTruthy();
    expect(response.refreshToken).toBeTruthy();

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
});
