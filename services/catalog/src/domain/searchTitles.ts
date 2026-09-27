import { InvalidSearchTitlesInputError } from './errors.js';
import { searchTitlesInputSchema } from './schemas.js';
import type { TitleRecord, TitleRepository } from './titleRepository.js';

/**
 * Full-text search over PUBLISHED titles (docs/03-catalog.md, "Recherche
 * et indexation") — ranked by relevance (ts_rank), best match first. No
 * pagination in V1 — see SearchTitles' comment in /proto/catalog.proto for
 * why a plain capped list is enough for now.
 */
export async function searchTitles(rawInput: unknown, titleRepository: TitleRepository): Promise<TitleRecord[]> {
  const parsed = searchTitlesInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidSearchTitlesInputError(parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  return titleRepository.search(parsed.data.query, parsed.data.limit, parsed.data.kidsSafeOnly);
}
