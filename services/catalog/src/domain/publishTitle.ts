import { MediaAssetNotReadyError, TitleNotFoundError } from './errors.js';
import type { TitleRecord, TitleRepository } from './titleRepository.js';

/**
 * Flips a Title to `PUBLISHED`. Refuses (MediaAssetNotReadyError) unless
 * the Title has a `READY` MediaAsset — a title is never published without
 * something playable behind it (docs/03-catalog.md, "Bonnes pratiques":
 * never expose a title whose media isn't ready). No un-publish/archive
 * path here — that's a separate future feature.
 */
export async function publishTitle(id: string, titleRepository: TitleRepository): Promise<TitleRecord> {
  const title = await titleRepository.findById(id);
  if (!title) {
    throw new TitleNotFoundError();
  }
  if (title.mediaAssetStatus !== 'READY') {
    throw new MediaAssetNotReadyError();
  }
  return titleRepository.updateStatus(id, 'PUBLISHED');
}
