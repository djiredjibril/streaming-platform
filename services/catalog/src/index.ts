/** Process entrypoint: starts the Catalog gRPC server. See README.md for env vars. */
import { prisma } from './infra/prismaClient.js';
import { logger } from './infra/logger.js';
import { buildCatalogServer, startCatalogServer } from './grpc/server.js';

const GRPC_ADDRESS = process.env.CATALOG_GRPC_ADDRESS ?? '0.0.0.0:50052';

async function main() {
  const server = buildCatalogServer(prisma);
  const port = await startCatalogServer(server, GRPC_ADDRESS);
  logger.info({ event: 'server_started', port });
}

main().catch((error) => {
  logger.error({ event: 'server_start_failed', error: String(error) });
  process.exit(1);
});
