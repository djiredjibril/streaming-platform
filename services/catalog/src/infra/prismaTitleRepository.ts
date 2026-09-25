import type { PrismaClient } from '../../generated/prisma-client/index.js';
import type { CreateTitleRecordInput, TitleRecord, TitleRepository } from '../domain/titleRepository.js';

/** Includes the (at most one) MediaAsset row and tagged genres so every TitleRecord carries them without a separate query. */
const includeMediaAssetAndGenres = {
  mediaAsset: true,
  titleGenres: { include: { genre: true } },
} as const;

/** Prisma-backed TitleRepository — the only file in this service that issues SQL (via Prisma) for titles. */
export class PrismaTitleRepository implements TitleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySlug(slug: string): Promise<TitleRecord | null> {
    const title = await this.prisma.title.findUnique({ where: { slug }, include: includeMediaAssetAndGenres });
    return title ? toTitleRecord(title) : null;
  }

  async findById(id: string): Promise<TitleRecord | null> {
    const title = await this.prisma.title.findUnique({ where: { id }, include: includeMediaAssetAndGenres });
    return title ? toTitleRecord(title) : null;
  }

  async create(input: CreateTitleRecordInput): Promise<TitleRecord> {
    const title = await this.prisma.title.create({
      data: {
        slug: input.slug,
        type: input.type,
        originalTitle: input.originalTitle,
        synopsis: input.synopsis,
        releaseYear: input.releaseYear,
        rating: input.rating,
        runtimeMinutes: input.runtimeMinutes,
        posterUrl: input.posterUrl,
        backdropUrl: input.backdropUrl,
        // Upsert-by-name: a genre not already in the table is created on the
        // fly (same pattern as Identity's Role upsert in CreateProfile) —
        // no separate seed script for a fixed genre list.
        titleGenres: {
          create: input.genres.map((name) => ({
            genre: { connectOrCreate: { where: { name }, create: { name } } },
          })),
        },
      },
      include: includeMediaAssetAndGenres,
    });
    return toTitleRecord(title);
  }

  async updateStatus(id: string, status: TitleRecord['status']): Promise<TitleRecord> {
    const title = await this.prisma.title.update({
      where: { id },
      data: { status },
      include: includeMediaAssetAndGenres,
    });
    return toTitleRecord(title);
  }
}

function toTitleRecord(title: {
  id: string;
  slug: string;
  type: string;
  originalTitle: string;
  synopsis: string;
  releaseYear: number;
  rating: string;
  runtimeMinutes: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  status: string;
  mediaAsset: { status: string; url: string } | null;
  titleGenres: { genre: { name: string } }[];
}): TitleRecord {
  return {
    id: title.id,
    slug: title.slug,
    type: title.type as TitleRecord['type'],
    originalTitle: title.originalTitle,
    synopsis: title.synopsis,
    releaseYear: title.releaseYear,
    rating: title.rating as TitleRecord['rating'],
    runtimeMinutes: title.runtimeMinutes,
    posterUrl: title.posterUrl,
    backdropUrl: title.backdropUrl,
    status: title.status as TitleRecord['status'],
    mediaAssetStatus: (title.mediaAsset?.status as TitleRecord['mediaAssetStatus']) ?? null,
    mediaAssetUrl: title.mediaAsset?.url ?? null,
    genres: title.titleGenres.map((tg) => tg.genre.name),
  };
}
