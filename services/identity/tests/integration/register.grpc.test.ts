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

describe('IdentityService.Register (real Postgres + gRPC)', () => {
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
    server = buildIdentityServer(prisma, logger);
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

  it('creates a pending_verification account and issues no tokens', async () => {
    const response = await register({
      email: 'ada@example.com',
      password: 'correct-horse-battery',
      accountType: AccountType.PERSO,
    });

    expect(response.accessToken).toBe('');
    expect(response.refreshToken).toBe('');
    expect(response.account?.status).toBe('PENDING_VERIFICATION');

    const stored = await prisma.account.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
    expect(stored.passwordHash).not.toBe('correct-horse-battery');
  });

  it('creates a StudentVerification row for ETUDIANT accounts', async () => {
    await register({
      email: 'student@example.com',
      password: 'correct-horse-battery',
      accountType: AccountType.ETUDIANT,
      universityEmail: 'student@university.edu',
    });

    const account = await prisma.account.findUniqueOrThrow({
      where: { email: 'student@example.com' },
      include: { studentVerification: true },
    });
    expect(account.studentVerification?.universityEmail).toBe('student@university.edu');
    expect(account.studentVerification?.verificationStatus).toBe('PENDING');
  });

  it('rejects a duplicate email with ALREADY_EXISTS', async () => {
    await register({
      email: 'dup@example.com',
      password: 'correct-horse-battery',
      accountType: AccountType.PERSO,
    });

    await expect(
      register({
        email: 'dup@example.com',
        password: 'another-password',
        accountType: AccountType.PERSO,
      }),
    ).rejects.toMatchObject({ code: grpc.status.ALREADY_EXISTS });
  });

  it('rejects ETUDIANT accounts missing universityEmail with INVALID_ARGUMENT', async () => {
    await expect(
      register({
        email: 'no-university@example.com',
        password: 'correct-horse-battery',
        accountType: AccountType.ETUDIANT,
      }),
    ).rejects.toMatchObject({ code: grpc.status.INVALID_ARGUMENT });
  });
});
