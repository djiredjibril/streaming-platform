import type { CreateTitleRecordInput, TitleRecord, TitleRepository } from '../../../src/domain/titleRepository.js';

/** In-memory fake for unit-testing /domain functions without a real database. */
export class InMemoryTitleRepository implements TitleRepository {
  private titlesById = new Map<string, TitleRecord>();

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
    };
    this.titlesById.set(record.id, record);
    return record;
  }

  async updateStatus(id: string, status: TitleRecord['status']): Promise<TitleRecord> {
    const title = this.mustGet(id);
    title.status = status;
    return title;
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
