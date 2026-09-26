import { beforeEach, describe, expect, it } from 'vitest';
import { browseTitles } from '../../src/domain/browseTitles.js';
import { createTitle } from '../../src/domain/createTitle.js';
import { InvalidBrowseTitlesInputError } from '../../src/domain/errors.js';
import { InMemoryTitleRepository } from './fakes/inMemoryTitleRepository.js';

describe('browseTitles', () => {
  let titleRepository: InMemoryTitleRepository;

  beforeEach(() => {
    titleRepository = new InMemoryTitleRepository();
  });

  async function createPublishedTitle(overrides: Partial<Parameters<typeof createTitle>[0]> & object = {}) {
    const title = await createTitle(
      {
        type: 'MOVIE',
        originalTitle: `Title ${Math.random()}`,
        synopsis: 'Y',
        releaseYear: 2020,
        rating: 'PG',
        runtimeMinutes: 90,
        ...overrides,
      },
      { titleRepository },
    );
    titleRepository.forceMediaAsset(title.id, 'READY');
    return titleRepository.updateStatus(title.id, 'PUBLISHED');
  }

  it('returns an empty page and no cursor when there are no titles', async () => {
    const result = await browseTitles({}, titleRepository);
    expect(result).toEqual({ titles: [], nextCursor: null });
  });

  it('never returns a DRAFT title', async () => {
    await createTitle(
      { type: 'MOVIE', originalTitle: 'Draft', synopsis: 'Y', releaseYear: 2020, rating: 'PG', runtimeMinutes: 90 },
      { titleRepository },
    );

    const result = await browseTitles({}, titleRepository);
    expect(result.titles).toEqual([]);
  });

  it('returns published titles newest first', async () => {
    const first = await createPublishedTitle({ originalTitle: 'First' });
    const second = await createPublishedTitle({ originalTitle: 'Second' });

    const result = await browseTitles({}, titleRepository);

    expect(result.titles.map((t) => t.id)).toEqual([second.id, first.id]);
    expect(result.nextCursor).toBeNull();
  });

  it('paginates: returns a nextCursor when there are more rows than the limit, and the cursor reaches the rest', async () => {
    const titles = [];
    for (let i = 0; i < 5; i++) {
      titles.push(await createPublishedTitle({ originalTitle: `Title ${i}` }));
    }

    const firstPage = await browseTitles({ limit: 2 }, titleRepository);
    expect(firstPage.titles).toHaveLength(2);
    expect(firstPage.titles.map((t) => t.id)).toEqual([titles[4].id, titles[3].id]);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await browseTitles({ limit: 2, cursor: firstPage.nextCursor! }, titleRepository);
    expect(secondPage.titles.map((t) => t.id)).toEqual([titles[2].id, titles[1].id]);
    expect(secondPage.nextCursor).not.toBeNull();

    const thirdPage = await browseTitles({ limit: 2, cursor: secondPage.nextCursor! }, titleRepository);
    expect(thirdPage.titles.map((t) => t.id)).toEqual([titles[0].id]);
    expect(thirdPage.nextCursor).toBeNull();
  });

  it('filters by type', async () => {
    const movie = await createPublishedTitle({ type: 'MOVIE', originalTitle: 'A Movie' });
    await createPublishedTitle({ type: 'SERIES', originalTitle: 'A Series', runtimeMinutes: undefined });

    const result = await browseTitles({ type: 'SERIES' }, titleRepository);
    expect(result.titles).toHaveLength(1);
    expect(result.titles[0]!.type).toBe('SERIES');
    void movie;
  });

  it('filters by genre', async () => {
    await createPublishedTitle({ originalTitle: 'Action Film', genres: ['Action'] });
    await createPublishedTitle({ originalTitle: 'Drama Film', genres: ['Drama'] });

    const result = await browseTitles({ genre: 'Action' }, titleRepository);
    expect(result.titles).toHaveLength(1);
    expect(result.titles[0]!.originalTitle).toBe('Action Film');
  });

  it('rejects a malformed cursor', async () => {
    await expect(browseTitles({ cursor: 'garbage' }, titleRepository)).rejects.toBeInstanceOf(
      InvalidBrowseTitlesInputError,
    );
  });

  it('rejects a limit above 50', async () => {
    await expect(browseTitles({ limit: 51 }, titleRepository)).rejects.toBeInstanceOf(InvalidBrowseTitlesInputError);
  });

  it('defaults limit to 20', async () => {
    for (let i = 0; i < 25; i++) {
      await createPublishedTitle({ originalTitle: `Title ${i}` });
    }

    const result = await browseTitles({}, titleRepository);
    expect(result.titles).toHaveLength(20);
    expect(result.nextCursor).not.toBeNull();
  });
});
