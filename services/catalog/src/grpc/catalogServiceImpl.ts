import * as grpc from '@grpc/grpc-js';
import type { ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import { attachMediaAsset } from '../domain/attachMediaAsset.js';
import { createTitle } from '../domain/createTitle.js';
import {
  InvalidAttachMediaAssetInputError,
  InvalidCreateTitleInputError,
  MediaAssetNotReadyError,
  SlugAlreadyExistsError,
  TitleNotFoundError,
} from '../domain/errors.js';
import { getTitleBySlug } from '../domain/getTitleBySlug.js';
import type { MediaAssetRepository } from '../domain/mediaAssetRepository.js';
import { publishTitle } from '../domain/publishTitle.js';
import type { MediaAssetStatusInput, TitleRecord, TitleRepository } from '../domain/titleRepository.js';
import type { ContentRatingInput, TitleTypeInput } from '../domain/schemas.js';
import {
  ContentRating,
  MediaAssetStatus,
  type AttachMediaAssetRequest,
  type CreateTitleRequest,
  type GetTitleBySlugRequest,
  type PublishTitleRequest,
  type Title as ProtoTitle,
  TitleStatus,
  TitleType,
} from './generated/catalog.js';

export interface CatalogServiceDeps {
  titleRepository: TitleRepository;
  mediaAssetRepository: MediaAssetRepository;
}

const titleTypeToProto: Record<TitleTypeInput, TitleType> = {
  MOVIE: TitleType.MOVIE,
  SERIES: TitleType.SERIES,
  SHORT: TitleType.SHORT,
};

const titleTypeToDomain: Partial<Record<TitleType, TitleTypeInput>> = {
  [TitleType.MOVIE]: 'MOVIE',
  [TitleType.SERIES]: 'SERIES',
  [TitleType.SHORT]: 'SHORT',
};

const contentRatingToProto: Record<ContentRatingInput, ContentRating> = {
  G: ContentRating.G,
  PG: ContentRating.PG,
  PG_13: ContentRating.PG_13,
  R: ContentRating.R,
  NC_17: ContentRating.NC_17,
  UNRATED: ContentRating.UNRATED,
};

const contentRatingToDomain: Partial<Record<ContentRating, ContentRatingInput>> = {
  [ContentRating.G]: 'G',
  [ContentRating.PG]: 'PG',
  [ContentRating.PG_13]: 'PG_13',
  [ContentRating.R]: 'R',
  [ContentRating.NC_17]: 'NC_17',
  [ContentRating.UNRATED]: 'UNRATED',
};

const titleStatusToProto: Record<TitleRecord['status'], TitleStatus> = {
  DRAFT: TitleStatus.DRAFT,
  PUBLISHED: TitleStatus.PUBLISHED,
  ARCHIVED: TitleStatus.ARCHIVED,
};

const mediaAssetStatusToProto: Record<MediaAssetStatusInput, MediaAssetStatus> = {
  PENDING_UPLOAD: MediaAssetStatus.PENDING_UPLOAD,
  PROCESSING: MediaAssetStatus.PROCESSING,
  READY: MediaAssetStatus.READY,
  FAILED: MediaAssetStatus.FAILED,
};

function titleToProto(title: TitleRecord): ProtoTitle {
  return {
    id: title.id,
    slug: title.slug,
    type: titleTypeToProto[title.type],
    originalTitle: title.originalTitle,
    synopsis: title.synopsis,
    releaseYear: title.releaseYear,
    rating: contentRatingToProto[title.rating],
    runtimeMinutes: title.runtimeMinutes ?? undefined,
    posterUrl: title.posterUrl ?? undefined,
    backdropUrl: title.backdropUrl ?? undefined,
    status: titleStatusToProto[title.status],
    mediaAssetStatus: title.mediaAssetStatus
      ? mediaAssetStatusToProto[title.mediaAssetStatus]
      : MediaAssetStatus.MEDIA_ASSET_STATUS_UNSPECIFIED,
    mediaAssetUrl: title.mediaAssetUrl ?? undefined,
  };
}

/**
 * Builds the CatalogService gRPC handler map. Pure adapter: translates
 * proto messages to/from the domain layer and maps domain errors to gRPC
 * status codes — no business logic lives here (same shape as Identity's
 * identityServiceImpl.ts).
 */
export function createCatalogServiceImpl(deps: CatalogServiceDeps) {
  return {
    async createTitle(
      call: ServerUnaryCall<CreateTitleRequest, ProtoTitle>,
      callback: sendUnaryData<ProtoTitle>,
    ): Promise<void> {
      try {
        const title = await createTitle(
          {
            type: titleTypeToDomain[call.request.type],
            originalTitle: call.request.originalTitle,
            synopsis: call.request.synopsis,
            releaseYear: call.request.releaseYear,
            rating: contentRatingToDomain[call.request.rating],
            runtimeMinutes: call.request.runtimeMinutes,
            posterUrl: call.request.posterUrl,
            backdropUrl: call.request.backdropUrl,
          },
          { titleRepository: deps.titleRepository },
        );
        callback(null, titleToProto(title));
      } catch (error) {
        callback(toGrpcError(error), null);
      }
    },

    async getTitleBySlug(
      call: ServerUnaryCall<GetTitleBySlugRequest, ProtoTitle>,
      callback: sendUnaryData<ProtoTitle>,
    ): Promise<void> {
      try {
        const title = await getTitleBySlug(call.request.slug, deps.titleRepository);
        callback(null, titleToProto(title));
      } catch (error) {
        callback(toGrpcError(error), null);
      }
    },

    async attachMediaAsset(
      call: ServerUnaryCall<AttachMediaAssetRequest, ProtoTitle>,
      callback: sendUnaryData<ProtoTitle>,
    ): Promise<void> {
      try {
        const title = await attachMediaAsset(
          { titleId: call.request.titleId, url: call.request.url },
          { titleRepository: deps.titleRepository, mediaAssetRepository: deps.mediaAssetRepository },
        );
        callback(null, titleToProto(title));
      } catch (error) {
        callback(toGrpcError(error), null);
      }
    },

    async publishTitle(
      call: ServerUnaryCall<PublishTitleRequest, ProtoTitle>,
      callback: sendUnaryData<ProtoTitle>,
    ): Promise<void> {
      try {
        const title = await publishTitle(call.request.id, deps.titleRepository);
        callback(null, titleToProto(title));
      } catch (error) {
        callback(toGrpcError(error), null);
      }
    },
  };
}

/** Maps a domain error to a gRPC ServiceError; unrecognized errors become INTERNAL (never leak internals to the caller). */
function toGrpcError(error: unknown): grpc.ServiceError {
  if (error instanceof InvalidCreateTitleInputError) {
    return buildServiceError(grpc.status.INVALID_ARGUMENT, error.message);
  }
  if (error instanceof SlugAlreadyExistsError) {
    return buildServiceError(grpc.status.ALREADY_EXISTS, error.message);
  }
  if (error instanceof TitleNotFoundError) {
    return buildServiceError(grpc.status.NOT_FOUND, error.message);
  }
  if (error instanceof InvalidAttachMediaAssetInputError) {
    return buildServiceError(grpc.status.INVALID_ARGUMENT, error.message);
  }
  if (error instanceof MediaAssetNotReadyError) {
    return buildServiceError(grpc.status.FAILED_PRECONDITION, error.message);
  }
  return buildServiceError(grpc.status.INTERNAL, 'Internal error');
}

function buildServiceError(code: grpc.status, message: string): grpc.ServiceError {
  return Object.assign(new Error(message), {
    code,
    details: message,
    metadata: new grpc.Metadata(),
  });
}
