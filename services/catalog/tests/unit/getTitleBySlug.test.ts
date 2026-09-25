import { beforeEach, describe, expect, it } from 'vitest';
import { createTitle } from '../../src/domain/createTitle.js';
import { TitleNotFoundError } from '../../src/domain/errors.js';
import { getTitleBySlug } from '../../src/domain/getTitleBySlug.js';
import { InMemoryTitleRepository } from './fakes/inMemoryTitleRepository.js';

describe('getTitleBySlug', () => {
  let titleRepository: InMemoryTitleRepository;

  beforeEach(() => {
    titleRepository = new InMemoryTitleRepository();
  });

  const input = {
    type: 'MOVIE',
    originalTitle: 'The Matrix',
    synopsis: 'A hacker discovers reality is a simulation.',
    releaseYear: 1999,
    rating: 'R',
    runtimeMinutes: 136,
  };

  it('rejects an unknown slug', async () => {
    await expect(getTitleBySlug('unknown-slug', titleRepository)).rejects.toBeInstanceOf(TitleNotFoundError);
  });

  it('rejects a real title that is still DRAFT (never expose unpublished content)', async () => {
    await createTitle(input, { titleRepository });

    await expect(getTitleBySlug('the-matrix-1999', titleRepository)).rejects.toBeInstanceOf(TitleNotFoundError);
  });

  it('rejects an ARCHIVED title the same way as an unknown slug', async () => {
    await createTitle(input, { titleRepository });
    titleRepository.forceStatus('the-matrix-1999', 'ARCHIVED');

    await expect(getTitleBySlug('the-matrix-1999', titleRepository)).rejects.toBeInstanceOf(TitleNotFoundError);
  });

  it('returns a PUBLISHED title', async () => {
    await createTitle(input, { titleRepository });
    titleRepository.forceStatus('the-matrix-1999', 'PUBLISHED');

    const title = await getTitleBySlug('the-matrix-1999', titleRepository);
    expect(title.originalTitle).toBe('The Matrix');
    expect(title.status).toBe('PUBLISHED');
  });
});
