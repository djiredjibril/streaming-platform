import { Prisma, type PrismaClient } from '../../generated/prisma-client/index.js';
import type {
  BrowseTitlesFilter,
  CreateTitleRecordInput,
  TitleRecord,
  TitleRepository,
} from '../domain/titleRepository.js';

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

  async browse(filter: BrowseTitlesFilter): Promise<TitleRecord[]> {
    const titles = await this.prisma.title.findMany({
      where: {
        status: 'PUBLISHED',
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.genre ? { titleGenres: { some: { genre: { name: filter.genre } } } } : {}),
        // Keyset pagination: strictly older than the cursor row, tiebroken
        // by id — matches the ORDER BY below exactly, which is what keeps
        // this correct even when several titles share a `createdAt`.
        ...(filter.cursor
          ? {
              OR: [
                { createdAt: { lt: filter.cursor.createdAt } },
                { createdAt: filter.cursor.createdAt, id: { lt: filter.cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filter.limit,
      include: includeMediaAssetAndGenres,
    });
    return titles.map(toTitleRecord);
  }

  async search(query: string, limit: number): Promise<TitleRecord[]> {
    // Two queries rather than one big join: `search_vector` is `Unsupported`
    // in the Prisma schema (see its comment there), so it can't appear in a
    // normal `findMany` filter/orderBy — only in raw SQL. This raw query
    // gets just the ranked ids; the normal `findMany` below reuses the
    // existing MediaAsset/genre include instead of duplicating that join by
    // hand in raw SQL.
    const ranked = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM titles
      WHERE status = 'PUBLISHED'
        AND search_vector @@ plainto_tsquery('english', ${query})
      ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${query})) DESC
      LIMIT ${limit}
    `);
    if (ranked.length === 0) return [];

    const titles = await this.prisma.title.findMany({
      where: { id: { in: ranked.map((r) => r.id) } },
      include: includeMediaAssetAndGenres,
    });
    const byId = new Map(titles.map((t) => [t.id, t]));
    // findMany doesn't preserve the `IN (...)` order — re-sort to match the
    // raw query's ts_rank order (SearchTitlesResponse's contract: "the
    // Gateway must not re-sort these").
    return ranked.map((r) => toTitleRecord(byId.get(r.id)!));
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
  createdAt: Date;
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
    createdAt: title.createdAt,
    mediaAssetStatus: (title.mediaAsset?.status as TitleRecord['mediaAssetStatus']) ?? null,
    mediaAssetUrl: title.mediaAsset?.url ?? null,
    genres: title.titleGenres.map((tg) => tg.genre.name),
  };
}
