import { prisma } from './infra/prismaClient.js';
import { logger } from './infra/logger.js';
import { buildIdentityServer, startIdentityServer } from './grpc/server.js';

const GRPC_ADDRESS = process.env.IDENTITY_GRPC_ADDRESS ?? '0.0.0.0:50051';

async function main() {
  const server = buildIdentityServer(prisma);
  const port = await startIdentityServer(server, GRPC_ADDRESS);
  logger.info({ event: 'server_started', port });
}

main().catch((error) => {
  logger.error({ event: 'server_start_failed', error: String(error) });
  process.exit(1);
});
