import type { CreateTitleRecordInput, TitleRecord, TitleRepository } from '../../../src/domain/titleRepository.js';

/** In-memory fake for unit-testing /domain functions without a real database. */
export class InMemoryTitleRepository implements TitleRepository {
  private titlesBySlug = new Map<string, TitleRecord>();

  async findBySlug(slug: string): Promise<TitleRecord | null> {
    return this.titlesBySlug.get(slug) ?? null;
  }

  async create(input: CreateTitleRecordInput): Promise<TitleRecord> {
    const record: TitleRecord = {
      id: `title_${this.titlesBySlug.size + 1}`,
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
    };
    this.titlesBySlug.set(record.slug, record);
    return record;
  }

  /** Test-only helper: bypasses the (not-yet-built) publish mutation to set a status directly — see getTitleBySlug.ts's docstring. */
  forceStatus(slug: string, status: TitleRecord['status']): void {
    const title = this.titlesBySlug.get(slug);
    if (!title) throw new Error(`No title with slug ${slug}`);
    title.status = status;
  }
}
