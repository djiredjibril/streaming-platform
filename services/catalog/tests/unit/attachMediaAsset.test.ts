import { beforeEach, describe, expect, it } from 'vitest';
import { attachMediaAsset } from '../../src/domain/attachMediaAsset.js';
import { createTitle } from '../../src/domain/createTitle.js';
import { InvalidAttachMediaAssetInputError, TitleNotFoundError } from '../../src/domain/errors.js';
import { InMemoryMediaAssetRepository } from './fakes/inMemoryMediaAssetRepository.js';
import { InMemoryTitleRepository } from './fakes/inMemoryTitleRepository.js';

describe('attachMediaAsset', () => {
  let titleRepository: InMemoryTitleRepository;
  let mediaAssetRepository: InMemoryMediaAssetRepository;

  beforeEach(() => {
    titleRepository = new InMemoryTitleRepository();
    mediaAssetRepository = new InMemoryMediaAssetRepository();
  });

  async function createDraftTitle() {
    return createTitle(
      {
        type: 'MOVIE',
        originalTitle: 'The Matrix',
        synopsis: 'A hacker discovers reality is a simulation.',
        releaseYear: 1999,
        rating: 'R',
        runtimeMinutes: 136,
      },
      { titleRepository },
    );
  }

  it('attaches a READY media asset to an existing title', async () => {
    const title = await createDraftTitle();

    const updated = await attachMediaAsset(
      { titleId: title.id, url: 'https://example.com/matrix.mp4' },
      { titleRepository, mediaAssetRepository },
    );

    expect(updated.mediaAssetStatus).toBe('READY');
    expect(updated.mediaAssetUrl).toBe('https://example.com/matrix.mp4');
    expect(updated.status).toBe('DRAFT'); // attaching media doesn't publish
  });

  it('replacing an existing asset keeps a single one (url + status updated)', async () => {
    const title = await createDraftTitle();
    await attachMediaAsset({ titleId: title.id, url: 'https://example.com/v1.mp4' }, { titleRepository, mediaAssetRepository });

    const updated = await attachMediaAsset(
      { titleId: title.id, url: 'https://example.com/v2.mp4' },
      { titleRepository, mediaAssetRepository },
    );

    expect(updated.mediaAssetUrl).toBe('https://example.com/v2.mp4');
  });

  it('rejects an unknown titleId', async () => {
    await expect(
      attachMediaAsset(
        { titleId: '00000000-0000-0000-0000-000000000000', url: 'https://example.com/v.mp4' },
        { titleRepository, mediaAssetRepository },
      ),
    ).rejects.toBeInstanceOf(TitleNotFoundError);
  });

  it('rejects a malformed url', async () => {
    const title = await createDraftTitle();

    await expect(
      attachMediaAsset({ titleId: title.id, url: 'not-a-url' }, { titleRepository, mediaAssetRepository }),
    ).rejects.toBeInstanceOf(InvalidAttachMediaAssetInputError);
  });

  it('rejects an empty titleId', async () => {
    await expect(
      attachMediaAsset({ titleId: '', url: 'https://example.com/v.mp4' }, { titleRepository, mediaAssetRepository }),
    ).rejects.toBeInstanceOf(InvalidAttachMediaAssetInputError);
  });
});
