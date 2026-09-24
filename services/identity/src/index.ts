/** Process entrypoint: starts the Identity gRPC server. See README.md for env vars. */
import { prisma } from './infra/prismaClient.js';
import { createRedisClient } from './infra/redisClient.js';
import { logger } from './infra/logger.js';
import { buildIdentityServer, startIdentityServer } from './grpc/server.js';

const GRPC_ADDRESS = process.env.IDENTITY_GRPC_ADDRESS ?? '0.0.0.0:50051';

// Fail-fast on missing secrets/config (services/AGENT.md §1) — no hardcoded defaults.
const JWT_SECRET = requireEnv('JWT_SECRET');
const REDIS_URL = requireEnv('REDIS_URL');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const redis = createRedisClient(REDIS_URL);
  const server = buildIdentityServer(prisma, JWT_SECRET, redis);
  const port = await startIdentityServer(server, GRPC_ADDRESS);
  logger.info({ event: 'server_started', port });
}

main().catch((error) => {
  logger.error({ event: 'server_start_failed', error: String(error) });
  process.exit(1);
});
