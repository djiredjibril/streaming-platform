import { InvalidAttachMediaAssetInputError, TitleNotFoundError } from './errors.js';
import { attachMediaAssetInputSchema } from './schemas.js';
import type { MediaAssetRepository } from './mediaAssetRepository.js';
import type { TitleRecord, TitleRepository } from './titleRepository.js';

export interface AttachMediaAssetDeps {
  titleRepository: TitleRepository;
  mediaAssetRepository: MediaAssetRepository;
}

/**
 * Attaches (or replaces) the one static video file for a Title — see
 * prisma/schema.prisma's MediaAsset comment for why this is a stand-in for
 * a real upload pipeline (04-media-pipeline.md, Phase 2) rather than a
 * proper upload flow: `url` is trusted as already pointing at a playable
 * file, and the asset is marked `READY` immediately.
 */
export async function attachMediaAsset(rawInput: unknown, deps: AttachMediaAssetDeps): Promise<TitleRecord> {
  const parsed = attachMediaAssetInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidAttachMediaAssetInputError(parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const title = await deps.titleRepository.findById(parsed.data.titleId);
  if (!title) {
    throw new TitleNotFoundError();
  }

  const mediaAsset = await deps.mediaAssetRepository.upsertForTitle(parsed.data.titleId, parsed.data.url);

  // Built from `title` + the upsert's own return value rather than
  // re-fetched from titleRepository — doesn't assume TitleRepository joins
  // in the media asset (true for the real Prisma-backed one, not
  // necessarily for a test double), and saves a query either way.
  return { ...title, mediaAssetStatus: mediaAsset.status, mediaAssetUrl: mediaAsset.url };
}
