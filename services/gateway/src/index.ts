/** Process entrypoint: starts the Gateway HTTP server. See README.md for env vars. */
import { createCatalogClient } from './grpc/catalogClient.js';
import { createIdentityClient } from './grpc/identityClient.js';
import { buildGatewayServer } from './http/server.js';
import { logger } from './infra/logger.js';

const IDENTITY_GRPC_ADDRESS = process.env.IDENTITY_GRPC_ADDRESS ?? '127.0.0.1:50051';
const CATALOG_GRPC_ADDRESS = process.env.CATALOG_GRPC_ADDRESS ?? '127.0.0.1:50052';
const HTTP_PORT = Number(process.env.GATEWAY_HTTP_PORT ?? 3000);

async function main() {
  const identityClient = createIdentityClient(IDENTITY_GRPC_ADDRESS);
  const catalogClient = createCatalogClient(CATALOG_GRPC_ADDRESS);
  const fastify = buildGatewayServer({ identityClient, catalogClient, logger });
  await fastify.listen({ port: HTTP_PORT, host: '0.0.0.0' });
  logger.info({ event: 'server_started', port: HTTP_PORT });
}

main().catch((error) => {
  logger.error({ event: 'server_start_failed', error: String(error) });
  process.exit(1);
});
