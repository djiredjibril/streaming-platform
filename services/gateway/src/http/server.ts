import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { registerGraphQL } from '../graphql/server.js';
import type { CatalogServiceClient } from '../grpc/generated/catalog.js';
import type { IdentityServiceClient } from '../grpc/generated/identity.js';
import type { Logger } from '@streaming/shared-logging';
import { registerAuthRoutes } from './routes/auth.js';

export interface GatewayServerDeps {
  identityClient: IdentityServiceClient;
  catalogClient: CatalogServiceClient;
  logger: Logger;
}

/**
 * Builds the Fastify instance, registers every REST route (/auth/*) and
 * mounts GraphQL (Catalog, then Social/Discovery once those exist) at
 * /graphql.
 *
 * `deps.logger` (Pino) is structurally compatible with Fastify's expected
 * logger shape but not identical to its `FastifyBaseLogger` type — cast
 * once here rather than threading a custom Logger generic through every
 * Fastify type downstream.
 */
export function buildGatewayServer(deps: GatewayServerDeps): FastifyInstance {
  const fastify = Fastify({
    loggerInstance: deps.logger as unknown as FastifyBaseLogger,
    // `request.id` becomes the correlation_id for this request — reused from an
    // incoming `x-correlation-id` header when present (upstream proxy/client already
    // tracing it) so it's the same id end-to-end instead of two disjoint ones.
    genReqId: (req: IncomingMessage) => {
      const incoming = req.headers['x-correlation-id'];
      return typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    },
    // Renames the `reqId` log field to `correlation_id` (services/AGENT.md §5's exact
    // field name) so Fastify's own access logs carry it for free. Deprecated in this
    // Fastify version but still functional — see the plan's risk note.
    requestIdLogLabel: 'correlation_id',
  });
  // No secret needed: we only read/write the refresh token cookie's value verbatim, never sign it.
  fastify.register(fastifyCookie);
  registerAuthRoutes(fastify, deps);
  registerGraphQL(fastify, deps);
  return fastify;
}
