import { beforeEach, describe, expect, it } from 'vitest';
import { createTitle } from '../../src/domain/createTitle.js';
import { InvalidSearchTitlesInputError } from '../../src/domain/errors.js';
import type { ContentRatingInput } from '../../src/domain/schemas.js';
import { searchTitles } from '../../src/domain/searchTitles.js';
import { InMemoryTitleRepository } from './fakes/inMemoryTitleRepository.js';

describe('searchTitles', () => {
  let titleRepository: InMemoryTitleRepository;

  beforeEach(() => {
    titleRepository = new InMemoryTitleRepository();
  });

  async function createPublishedTitle(originalTitle: string, synopsis: string, rating: ContentRatingInput = 'PG') {
    const title = await createTitle(
      { type: 'MOVIE', originalTitle, synopsis, releaseYear: 2020, rating, runtimeMinutes: 90 },
      { titleRepository },
    );
    titleRepository.forceMediaAsset(title.id, 'READY');
    return titleRepository.updateStatus(title.id, 'PUBLISHED');
  }

  it('finds a published title by (partial, case-insensitive) title match', async () => {
    const title = await createPublishedTitle('The Matrix', 'A hacker discovers reality is a simulation.');

    const results = await searchTitles({ query: 'matrix' }, titleRepository);

    expect(results.map((t) => t.id)).toEqual([title.id]);
  });

  it('finds a published title by synopsis match', async () => {
    const title = await createPublishedTitle('Unrelated Name', 'A story about dragons and knights.');

    const results = await searchTitles({ query: 'dragons' }, titleRepository);

    expect(results.map((t) => t.id)).toEqual([title.id]);
  });

  it('never returns a DRAFT title', async () => {
    await createTitle(
      { type: 'MOVIE', originalTitle: 'Draft Matrix', synopsis: 'Y', releaseYear: 2020, rating: 'PG', runtimeMinutes: 90 },
      { titleRepository },
    );

    const results = await searchTitles({ query: 'matrix' }, titleRepository);
    expect(results).toEqual([]);
  });

  it('returns an empty array for no match', async () => {
    await createPublishedTitle('The Matrix', 'A hacker discovers reality is a simulation.');

    const results = await searchTitles({ query: 'nonexistent-term' }, titleRepository);
    expect(results).toEqual([]);
  });

  it('rejects an empty query', async () => {
    await expect(searchTitles({ query: '' }, titleRepository)).rejects.toBeInstanceOf(InvalidSearchTitlesInputError);
  });

  it('rejects a query over 200 characters', async () => {
    await expect(searchTitles({ query: 'a'.repeat(201) }, titleRepository)).rejects.toBeInstanceOf(
      InvalidSearchTitlesInputError,
    );
  });

  it('rejects a limit above 50', async () => {
    await expect(searchTitles({ query: 'matrix', limit: 51 }, titleRepository)).rejects.toBeInstanceOf(
      InvalidSearchTitlesInputError,
    );
  });

  it('defaults limit to 20', async () => {
    for (let i = 0; i < 25; i++) {
      await createPublishedTitle(`Matrix ${i}`, 'Y');
    }

    const results = await searchTitles({ query: 'matrix' }, titleRepository);
    expect(results).toHaveLength(20);
  });

  it('kidsSafeOnly excludes a matching title rated outside G/PG', async () => {
    await createPublishedTitle('Matrix for Kids', 'Y', 'G');
    await createPublishedTitle('Matrix Reloaded (R)', 'Y', 'R');

    const results = await searchTitles({ query: 'matrix', kidsSafeOnly: true }, titleRepository);
    expect(results.map((t) => t.originalTitle)).toEqual(['Matrix for Kids']);
  });

  it('kidsSafeOnly defaults to false — a mature match is still returned when omitted', async () => {
    await createPublishedTitle('Matrix Reloaded (R)', 'Y', 'R');

    const results = await searchTitles({ query: 'matrix' }, titleRepository);
    expect(results).toHaveLength(1);
  });
});
