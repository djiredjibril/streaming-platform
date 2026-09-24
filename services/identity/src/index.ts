/** Process entrypoint: starts the Identity gRPC server. See README.md for env vars. */
import { prisma } from './infra/prismaClient.js';
import { logger } from './infra/logger.js';
import { buildIdentityServer, startIdentityServer } from './grpc/server.js';

const GRPC_ADDRESS = process.env.IDENTITY_GRPC_ADDRESS ?? '0.0.0.0:50051';

// Fail-fast on missing secrets (services/AGENT.md §1) — no hardcoded default.
const JWT_SECRET = requireEnv('JWT_SECRET');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const server = buildIdentityServer(prisma, JWT_SECRET);
  const port = await startIdentityServer(server, GRPC_ADDRESS);
  logger.info({ event: 'server_started', port });
}

main().catch((error) => {
  logger.error({ event: 'server_start_failed', error: String(error) });
  process.exit(1);
});
