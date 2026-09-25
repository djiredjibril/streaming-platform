export interface TitleCursor {
  createdAt: Date;
  id: string;
}

/**
 * Opaque pagination cursor for BrowseTitles — encodes (createdAt, id) so
 * keyset pagination stays correct even when two titles share the same
 * `createdAt` (id is the tiebreaker in both the cursor and the query's
 * ORDER BY). Base64url rather than a plain string so the wire format is
 * clearly "opaque, don't parse me" to any client, per the cursor-based
 * pagination convention in docs/03-catalog.md's "Bonnes pratiques".
 */
export function encodeCursor(cursor: TitleCursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`, 'utf8').toString('base64url');
}

/** Throws a plain Error (not a domain error class) on anything malformed — callers (browseTitles.ts) wrap it into InvalidBrowseTitlesInputError, since only that layer knows this is a client-facing INVALID_ARGUMENT case, not an internal bug. */
export function decodeCursor(raw: string): TitleCursor {
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  const separatorIndex = decoded.indexOf('|');
  if (separatorIndex === -1) {
    throw new Error('Malformed cursor');
  }
  const iso = decoded.slice(0, separatorIndex);
  const id = decoded.slice(separatorIndex + 1);
  const createdAt = new Date(iso);
  if (!id || Number.isNaN(createdAt.getTime())) {
    throw new Error('Malformed cursor');
  }
  return { createdAt, id };
}
