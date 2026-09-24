import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import * as grpc from '@grpc/grpc-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// Test-only dependency on @streaming/identity: spins up the real Identity
// gRPC server instead of mocking it, so this test exercises the full
// HTTP -> gRPC -> Postgres chain. See services/gateway/README.md.
import { buildIdentityServer, startIdentityServer } from '@streaming/identity/dist/grpc/server.js';
import { createIdentityClient } from '../../src/grpc/identityClient.js';
import { buildGatewayServer } from '../../src/http/server.js';
import { logger } from '../../src/infra/logger.js';

describe('POST /auth/register (real Identity gRPC server + real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let identityServer: grpc.Server;
  let app: ReturnType<typeof buildGatewayServer>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const databaseUrl = container.getConnectionUri();

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: new URL('../../../identity/', import.meta.url),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    identityServer = buildIdentityServer(prisma);
    const identityPort = await startIdentityServer(identityServer, '127.0.0.1:0');

    const identityClient = createIdentityClient(`127.0.0.1:${identityPort}`);
    app = buildGatewayServer({ identityClient, logger });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => identityServer.tryShutdown(() => resolve()));
    await prisma.$disconnect();
    await container.stop();
  });

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
