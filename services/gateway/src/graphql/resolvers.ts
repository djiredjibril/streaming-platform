import * as grpc from '@grpc/grpc-js';
import { GraphQLError } from 'graphql';
import { callUnary } from '../grpc/callUnary.js';
import type {
  AttachMediaAssetRequest,
  CatalogServiceClient,
  CreateTitleRequest,
  PublishTitleRequest,
  Title as ProtoTitle,
} from '../grpc/generated/catalog.js';
import { ContentRating, MediaAssetStatus, TitleType } from '../grpc/generated/catalog.js';
import type { IdentityServiceClient, ValidateTokenRequest, ValidateTokenResponse } from '../grpc/generated/identity.js';
import type { Logger } from '../infra/logger.js';

export interface GraphQLContext {
  identityClient: IdentityServiceClient;
  catalogClient: CatalogServiceClient;
  logger: Logger;
  /** Raw `Authorization` header value, if any — read once here so resolvers don't touch the Fetch Request directly. */
  authorization: string | null;
  /** = Fastify's `request.id` (the correlation_id — see http/server.ts's genReqId). Set as x-correlation-id metadata on every gRPC call, same as the REST routes' requestMetadata(). */
  correlationId: string;
}

function correlationMetadata(context: GraphQLContext): grpc.Metadata {
  const metadata = new grpc.Metadata();
  metadata.set('x-correlation-id', context.correlationId);
  return metadata;
}

const titleTypeFromGraphQL: Record<string, TitleType> = {
  MOVIE: TitleType.MOVIE,
  SERIES: TitleType.SERIES,
  SHORT: TitleType.SHORT,
};

const titleTypeToGraphQL: Partial<Record<TitleType, string>> = {
  [TitleType.MOVIE]: 'MOVIE',
  [TitleType.SERIES]: 'SERIES',
  [TitleType.SHORT]: 'SHORT',
};

const contentRatingFromGraphQL: Record<string, ContentRating> = {
  G: ContentRating.G,
  PG: ContentRating.PG,
  PG_13: ContentRating.PG_13,
  R: ContentRating.R,
  NC_17: ContentRating.NC_17,
  UNRATED: ContentRating.UNRATED,
};

const contentRatingToGraphQL: Partial<Record<ContentRating, string>> = {
  [ContentRating.G]: 'G',
  [ContentRating.PG]: 'PG',
  [ContentRating.PG_13]: 'PG_13',
  [ContentRating.R]: 'R',
  [ContentRating.NC_17]: 'NC_17',
  [ContentRating.UNRATED]: 'UNRATED',
};

interface GraphQLTitle {
  id: string;
  slug: string;
  type: string | undefined;
  originalTitle: string;
  synopsis: string;
  releaseYear: number;
  rating: string | undefined;
  runtimeMinutes: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  isPlayable: boolean;
  videoUrl: string | null;
}

function titleToGraphQL(title: ProtoTitle): GraphQLTitle {
  return {
    id: title.id,
    slug: title.slug,
    type: titleTypeToGraphQL[title.type],
    originalTitle: title.originalTitle,
    synopsis: title.synopsis,
    releaseYear: title.releaseYear,
    rating: contentRatingToGraphQL[title.rating],
    runtimeMinutes: title.runtimeMinutes ?? null,
    posterUrl: title.posterUrl ?? null,
    backdropUrl: title.backdropUrl ?? null,
    isPlayable: title.mediaAssetStatus === MediaAssetStatus.READY,
    videoUrl: title.mediaAssetUrl ?? null,
  };
}

/**
 * Extracts the `Authorization: Bearer <token>` header, validates it via
 * IdentityService.ValidateToken, and throws a typed GraphQLError unless
 * the caller is an admin account (Account.isAdmin — services/identity's
 * minimal admin role). Same trust model as the REST Gateway's
 * requireAccountId() in http/routes/auth.ts, extended with the admin
 * check that CreateTitle needs (docs/03-catalog.md, CatalogService trusts
 * the Gateway to have done this).
 */
async function requireAdmin(context: GraphQLContext): Promise<void> {
  const accessToken = context.authorization?.startsWith('Bearer ')
    ? context.authorization.slice('Bearer '.length)
    : undefined;
  if (!accessToken) {
    throw new GraphQLError('Missing bearer token', { extensions: { code: 'UNAUTHENTICATED' } });
  }

  const validation = await callUnary<ValidateTokenRequest, ValidateTokenResponse>(
    context.identityClient.validateToken.bind(context.identityClient),
    { accessToken },
    correlationMetadata(context),
  );
  if (!validation.valid) {
    throw new GraphQLError('Invalid or expired access token', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  if (!validation.isAdmin) {
    throw new GraphQLError('Admin account required', { extensions: { code: 'FORBIDDEN' } });
  }
}

/** Maps a gRPC error to a typed GraphQLError. 500-equivalent errors are logged with full detail server-side and return a generic message (services/AGENT.md §8: never expose internals to the client) — same shape as the REST Gateway's mapGrpcError in http/routes/auth.ts. */
function toGraphQLError(error: unknown, logger: Logger, event: string): GraphQLError {
  const serviceError = error as grpc.ServiceError;
  switch (serviceError.code) {
    case grpc.status.INVALID_ARGUMENT:
      return new GraphQLError(serviceError.details || serviceError.message, {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    case grpc.status.ALREADY_EXISTS:
      return new GraphQLError(serviceError.details || serviceError.message, {
        extensions: { code: 'ALREADY_EXISTS' },
      });
    case grpc.status.NOT_FOUND:
      return new GraphQLError(serviceError.details || serviceError.message, { extensions: { code: 'NOT_FOUND' } });
    case grpc.status.FAILED_PRECONDITION:
      return new GraphQLError(serviceError.details || serviceError.message, {
        extensions: { code: 'FAILED_PRECONDITION' },
      });
    default:
      logger.error({ event, error: String(error) });
      return new GraphQLError('Internal error', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
  }
}

export const resolvers = {
  Query: {
    async title(_parent: unknown, args: { slug: string }, context: GraphQLContext): Promise<GraphQLTitle | null> {
      try {
        const title = await callUnary<{ slug: string }, ProtoTitle>(
          context.catalogClient.getTitleBySlug.bind(context.catalogClient),
          { slug: args.slug },
          correlationMetadata(context),
        );
        return titleToGraphQL(title);
      } catch (error) {
        const serviceError = error as grpc.ServiceError;
        if (serviceError.code === grpc.status.NOT_FOUND) {
          return null;
        }
        throw toGraphQLError(error, context.logger, 'title_query_failed');
      }
    },
  },
  Mutation: {
    async createTitle(
      _parent: unknown,
      args: {
        input: {
          type: string;
          originalTitle: string;
          synopsis: string;
          releaseYear: number;
          rating: string;
          runtimeMinutes?: number;
          posterUrl?: string;
          backdropUrl?: string;
        };
      },
      context: GraphQLContext,
    ): Promise<GraphQLTitle> {
      await requireAdmin(context);

      try {
        const title = await callUnary<CreateTitleRequest, ProtoTitle>(
          context.catalogClient.createTitle.bind(context.catalogClient),
          {
            type: titleTypeFromGraphQL[args.input.type],
            originalTitle: args.input.originalTitle,
            synopsis: args.input.synopsis,
            releaseYear: args.input.releaseYear,
            rating: contentRatingFromGraphQL[args.input.rating],
            runtimeMinutes: args.input.runtimeMinutes,
            posterUrl: args.input.posterUrl,
            backdropUrl: args.input.backdropUrl,
          },
          correlationMetadata(context),
        );
        return titleToGraphQL(title);
      } catch (error) {
        throw toGraphQLError(error, context.logger, 'create_title_mutation_failed');
      }
    },

    async attachMediaAsset(
      _parent: unknown,
      args: { input: { titleId: string; url: string } },
      context: GraphQLContext,
    ): Promise<GraphQLTitle> {
      await requireAdmin(context);

      try {
        const title = await callUnary<AttachMediaAssetRequest, ProtoTitle>(
          context.catalogClient.attachMediaAsset.bind(context.catalogClient),
          { titleId: args.input.titleId, url: args.input.url },
          correlationMetadata(context),
        );
        return titleToGraphQL(title);
      } catch (error) {
        throw toGraphQLError(error, context.logger, 'attach_media_asset_mutation_failed');
      }
    },

    async publishTitle(_parent: unknown, args: { id: string }, context: GraphQLContext): Promise<GraphQLTitle> {
      await requireAdmin(context);

      try {
        const title = await callUnary<PublishTitleRequest, ProtoTitle>(
          context.catalogClient.publishTitle.bind(context.catalogClient),
          { id: args.id },
          correlationMetadata(context),
        );
        return titleToGraphQL(title);
      } catch (error) {
        throw toGraphQLError(error, context.logger, 'publish_title_mutation_failed');
      }
    },
  },
};
