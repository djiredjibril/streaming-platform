import type {
  BrowseTitlesFilter,
  CreateTitleRecordInput,
  TitleRecord,
  TitleRepository,
} from '../../../src/domain/titleRepository.js';

/** In-memory fake for unit-testing /domain functions without a real database. */
export class InMemoryTitleRepository implements TitleRepository {
  private titlesById = new Map<string, TitleRecord>();
  private nextCreatedAt = new Date('2025-01-01T00:00:00.000Z').getTime();

  async findBySlug(slug: string): Promise<TitleRecord | null> {
    for (const title of this.titlesById.values()) {
      if (title.slug === slug) return title;
    }
    return null;
  }

  async findById(id: string): Promise<TitleRecord | null> {
    return this.titlesById.get(id) ?? null;
  }

  async create(input: CreateTitleRecordInput): Promise<TitleRecord> {
    // Deterministic, strictly-increasing createdAt (no real clock — keeps
    // browse() pagination tests reproducible regardless of run speed).
    const createdAt = new Date(this.nextCreatedAt);
    this.nextCreatedAt += 1000;

    const record: TitleRecord = {
      id: `title_${this.titlesById.size + 1}`,
      slug: input.slug,
      type: input.type,
      originalTitle: input.originalTitle,
      synopsis: input.synopsis,
      releaseYear: input.releaseYear,
      rating: input.rating,
      runtimeMinutes: input.runtimeMinutes ?? null,
      posterUrl: input.posterUrl ?? null,
      backdropUrl: input.backdropUrl ?? null,
      status: 'DRAFT',
      mediaAssetStatus: null,
      mediaAssetUrl: null,
      genres: input.genres,
      createdAt,
    };
    this.titlesById.set(record.id, record);
    return record;
  }

  async updateStatus(id: string, status: TitleRecord['status']): Promise<TitleRecord> {
    const title = this.mustGet(id);
    title.status = status;
    return title;
  }

  async browse(filter: BrowseTitlesFilter): Promise<TitleRecord[]> {
    let titles = [...this.titlesById.values()].filter((t) => t.status === 'PUBLISHED');
    if (filter.type) {
      titles = titles.filter((t) => t.type === filter.type);
    }
    if (filter.genre) {
      titles = titles.filter((t) => t.genres.includes(filter.genre!));
    }
    titles.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
    if (filter.cursor) {
      const { createdAt, id } = filter.cursor;
      titles = titles.filter(
        (t) => t.createdAt.getTime() < createdAt.getTime() || (t.createdAt.getTime() === createdAt.getTime() && t.id < id),
      );
    }
    return titles.slice(0, filter.limit);
  }

  /** Test-only helper: bypasses the (not-yet-built) un-publish/archive mutation to set a status directly. */
  forceStatus(slugOrId: string, status: TitleRecord['status']): void {
    const title = this.titlesById.get(slugOrId) ?? [...this.titlesById.values()].find((t) => t.slug === slugOrId);
    if (!title) throw new Error(`No title ${slugOrId}`);
    title.status = status;
  }

  /** Test-only helper: simulates AttachMediaAsset without going through the real domain function (used by getTitleBySlug/publishTitle tests that only care about a pre-existing ready asset). */
  forceMediaAsset(id: string, status: TitleRecord['mediaAssetStatus'], url = 'https://example.com/video.mp4'): void {
    const title = this.mustGet(id);
    title.mediaAssetStatus = status;
    title.mediaAssetUrl = status ? url : null;
  }

  private mustGet(id: string): TitleRecord {
    const title = this.titlesById.get(id);
    if (!title) throw new Error(`No title ${id}`);
    return title;
  }
}
