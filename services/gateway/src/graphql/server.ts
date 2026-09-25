import { createSchema, createYoga } from 'graphql-yoga';
import type { FastifyInstance } from 'fastify';
import type { CatalogServiceClient } from '../grpc/generated/catalog.js';
import type { IdentityServiceClient } from '../grpc/generated/identity.js';
import type { Logger } from '../infra/logger.js';
import { resolvers, type GraphQLContext } from './resolvers.js';
import { typeDefs } from './schema.js';

export interface GraphQLServerDeps {
  identityClient: IdentityServiceClient;
  catalogClient: CatalogServiceClient;
  logger: Logger;
}

/**
 * Mounts GraphQL Yoga on the Fastify instance at /graphql. Catalog is the
 * first (and for now only) domain exposed this way — see docs/00-OVERVIEW.md
 * on why GraphQL lives on the Gateway (the only service the frontend calls
 * directly) rather than on Catalog itself, resolved with the user before
 * this feature started.
 *
 * Uses Yoga's Fetch-API `fetch()` entry point, built from Fastify's
 * already-parsed `request.body`, rather than `yoga.handle(request.raw, ...)`
 * — the latter reads the body from the raw Node stream, which Fastify's
 * own JSON body parser has already consumed by the time this handler
 * runs, leaving Yoga nothing to read (discovered as a real bug writing
 * this feature's tests: every request failed with "Unexpected end of JSON
 * input").
 */
export function registerGraphQL(fastify: FastifyInstance, deps: GraphQLServerDeps): void {
  const yoga = createYoga<GraphQLContext>({
    schema: createSchema({ typeDefs, resolvers }),
  });

  fastify.route({
    url: '/graphql',
    method: ['GET', 'POST', 'OPTIONS'],
    handler: async (request, reply) => {
      const response = await yoga.fetch(
        `http://${request.headers.host ?? 'localhost'}${request.url}`,
        {
          method: request.method,
          headers: request.headers as HeadersInit,
          body: request.method === 'POST' ? JSON.stringify(request.body) : undefined,
        },
        {
          identityClient: deps.identityClient,
          catalogClient: deps.catalogClient,
          logger: deps.logger,
          authorization: request.headers.authorization ?? null,
          correlationId: request.id,
        },
      );

      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(Buffer.from(await response.arrayBuffer()));
    },
  });
}
