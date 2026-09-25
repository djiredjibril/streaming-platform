import { beforeEach, describe, expect, it } from 'vitest';
import { createTitle } from '../../src/domain/createTitle.js';
import { MediaAssetNotReadyError, TitleNotFoundError } from '../../src/domain/errors.js';
import { publishTitle } from '../../src/domain/publishTitle.js';
import { InMemoryTitleRepository } from './fakes/inMemoryTitleRepository.js';

describe('publishTitle', () => {
  let titleRepository: InMemoryTitleRepository;

  beforeEach(() => {
    titleRepository = new InMemoryTitleRepository();
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

  it('rejects a title with no media asset at all', async () => {
    const title = await createDraftTitle();

    await expect(publishTitle(title.id, titleRepository)).rejects.toBeInstanceOf(MediaAssetNotReadyError);
  });

  it('rejects a title whose media asset is not READY yet', async () => {
    const title = await createDraftTitle();
    titleRepository.forceMediaAsset(title.id, 'PENDING_UPLOAD');

    await expect(publishTitle(title.id, titleRepository)).rejects.toBeInstanceOf(MediaAssetNotReadyError);
  });

  it('publishes a title with a READY media asset', async () => {
    const title = await createDraftTitle();
    titleRepository.forceMediaAsset(title.id, 'READY');

    const published = await publishTitle(title.id, titleRepository);

    expect(published.status).toBe('PUBLISHED');
  });

  it('rejects an unknown title id', async () => {
    await expect(publishTitle('00000000-0000-0000-0000-000000000000', titleRepository)).rejects.toBeInstanceOf(
      TitleNotFoundError,
    );
  });
});
