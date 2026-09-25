import { beforeEach, describe, expect, it } from 'vitest';
import { createTitle } from '../../src/domain/createTitle.js';
import { InvalidCreateTitleInputError, SlugAlreadyExistsError } from '../../src/domain/errors.js';
import { InMemoryTitleRepository } from './fakes/inMemoryTitleRepository.js';

describe('createTitle', () => {
  let titleRepository: InMemoryTitleRepository;

  beforeEach(() => {
    titleRepository = new InMemoryTitleRepository();
  });

  const validMovieInput = {
    type: 'MOVIE',
    originalTitle: 'The Matrix',
    synopsis: 'A hacker discovers reality is a simulation.',
    releaseYear: 1999,
    rating: 'R',
    runtimeMinutes: 136,
  };

  it('creates a title in DRAFT status with a slug derived from title+year', async () => {
    const title = await createTitle(validMovieInput, { titleRepository });

    expect(title.slug).toBe('the-matrix-1999');
    expect(title.status).toBe('DRAFT');
    expect(title.originalTitle).toBe('The Matrix');
  });

  it('rejects a duplicate slug', async () => {
    await createTitle(validMovieInput, { titleRepository });

    await expect(createTitle(validMovieInput, { titleRepository })).rejects.toBeInstanceOf(SlugAlreadyExistsError);
  });

  it('rejects an empty originalTitle', async () => {
    await expect(
      createTitle({ ...validMovieInput, originalTitle: '' }, { titleRepository }),
    ).rejects.toBeInstanceOf(InvalidCreateTitleInputError);
  });

  it('rejects a MOVIE with no runtimeMinutes', async () => {
    const { runtimeMinutes: _runtimeMinutes, ...withoutRuntime } = validMovieInput;
    void _runtimeMinutes;
    await expect(createTitle(withoutRuntime, { titleRepository })).rejects.toBeInstanceOf(
      InvalidCreateTitleInputError,
    );
  });

  it('rejects a SERIES with a runtimeMinutes set (runtime lives on Episode instead)', async () => {
    await expect(
      createTitle({ ...validMovieInput, type: 'SERIES', runtimeMinutes: 45 }, { titleRepository }),
    ).rejects.toBeInstanceOf(InvalidCreateTitleInputError);
  });

  it('accepts a SERIES with no runtimeMinutes', async () => {
    const { runtimeMinutes: _runtimeMinutes, ...withoutRuntime } = validMovieInput;
    void _runtimeMinutes;
    const title = await createTitle({ ...withoutRuntime, type: 'SERIES' }, { titleRepository });
    expect(title.runtimeMinutes).toBeNull();
  });

  it('rejects an invalid rating', async () => {
    await expect(
      createTitle({ ...validMovieInput, rating: 'NOT_A_RATING' }, { titleRepository }),
    ).rejects.toBeInstanceOf(InvalidCreateTitleInputError);
  });

  describe('genres', () => {
    it('defaults to an empty array when omitted', async () => {
      const title = await createTitle(validMovieInput, { titleRepository });
      expect(title.genres).toEqual([]);
    });

    it('trims and deduplicates genre names', async () => {
      const title = await createTitle(
        { ...validMovieInput, genres: [' Action ', 'Sci-Fi', 'Action'] },
        { titleRepository },
      );
      expect(title.genres).toEqual(['Action', 'Sci-Fi']);
    });

    it('rejects an empty genre name', async () => {
      await expect(
        createTitle({ ...validMovieInput, genres: ['Action', '  '] }, { titleRepository }),
      ).rejects.toBeInstanceOf(InvalidCreateTitleInputError);
    });

    it('rejects more than 10 genres', async () => {
      const genres = Array.from({ length: 11 }, (_, i) => `Genre${i}`);
      await expect(createTitle({ ...validMovieInput, genres }, { titleRepository })).rejects.toBeInstanceOf(
        InvalidCreateTitleInputError,
      );
    });
  });
});
