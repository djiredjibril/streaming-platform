import { TitleNotFoundError } from './errors.js';
import type { TitleRecord, TitleRepository } from './titleRepository.js';

/**
 * Looks up a Title by slug, but only ever returns one that's `published` —
 * a real DRAFT/ARCHIVED title behaves identically to an unknown slug
 * (TitleNotFoundError either way). See catalog.proto's GetTitleBySlug
 * comment for why: this is what stops the public read path from being
 * usable to discover unpublished content by probing slugs.
 */
export async function getTitleBySlug(slug: string, titleRepository: TitleRepository): Promise<TitleRecord> {
  const title = await titleRepository.findBySlug(slug);
  if (!title || title.status !== 'PUBLISHED') {
    throw new TitleNotFoundError();
  }
  return title;
}
