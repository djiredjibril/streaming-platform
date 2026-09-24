import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import type { IdentityServiceClient } from '../grpc/generated/identity.js';
import type { Logger } from '@streaming/shared-logging';
import { registerAuthRoutes } from './routes/auth.js';

export interface GatewayServerDeps {
  identityClient: IdentityServiceClient;
  logger: Logger;
}

/**
 * Builds the Fastify instance and registers every REST route. GraphQL
 * (Catalog/Social/Discovery) will be mounted alongside this once those
 * services exist.
 *
 * `deps.logger` (Pino) is structurally compatible with Fastify's expected
 * logger shape but not identical to its `FastifyBaseLogger` type — cast
 * once here rather than threading a custom Logger generic through every
 * Fastify type downstream.
 */
export function buildGatewayServer(deps: GatewayServerDeps): FastifyInstance {
  const fastify = Fastify({ loggerInstance: deps.logger as unknown as FastifyBaseLogger });
  // No secret needed: we only read/write the refresh token cookie's value verbatim, never sign it.
  fastify.register(fastifyCookie);
  registerAuthRoutes(fastify, deps);
  return fastify;
}
