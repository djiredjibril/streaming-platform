import type { PrismaClient } from '@prisma/client';
import type { CreateTitleRecordInput, TitleRecord, TitleRepository } from '../domain/titleRepository.js';

/** Prisma-backed TitleRepository — the only file in this service that issues SQL (via Prisma) for titles. */
export class PrismaTitleRepository implements TitleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySlug(slug: string): Promise<TitleRecord | null> {
    const title = await this.prisma.title.findUnique({ where: { slug } });
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
      },
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
  };
}
