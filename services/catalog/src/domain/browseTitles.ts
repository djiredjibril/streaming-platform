import { decodeCursor, encodeCursor } from './cursor.js';
import { InvalidBrowseTitlesInputError } from './errors.js';
import { browseTitlesInputSchema } from './schemas.js';
import type { TitleRecord, TitleRepository } from './titleRepository.js';

export interface BrowseTitlesResult {
  titles: TitleRecord[];
  /** Null once there are no more pages. */
  nextCursor: string | null;
}

/**
 * Lists PUBLISHED titles, newest first, with optional genre/type filters —
 * see BrowseTitles' comment in /proto/catalog.proto for the cursor design.
 * Asks the repository for one extra row (`limit + 1`) to know whether a
 * next page exists without a separate COUNT query.
 */
export async function browseTitles(rawInput: unknown, titleRepository: TitleRepository): Promise<BrowseTitlesResult> {
  const parsed = browseTitlesInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidBrowseTitlesInputError(parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const input = parsed.data;

  let cursor: { createdAt: Date; id: string } | undefined;
  if (input.cursor !== undefined) {
    try {
      cursor = decodeCursor(input.cursor);
    } catch {
      throw new InvalidBrowseTitlesInputError('Malformed cursor');
    }
  }

  const rows = await titleRepository.browse({
    genre: input.genre,
    type: input.type,
    cursor,
    limit: input.limit + 1,
  });

  const hasNextPage = rows.length > input.limit;
  const titles = hasNextPage ? rows.slice(0, input.limit) : rows;
  const lastTitle = titles[titles.length - 1];
  const nextCursor = hasNextPage && lastTitle ? encodeCursor({ createdAt: lastTitle.createdAt, id: lastTitle.id }) : null;

  return { titles, nextCursor };
}
