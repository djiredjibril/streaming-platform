import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../src/domain/cursor.js';

describe('cursor', () => {
  it('round-trips (createdAt, id)', () => {
    const createdAt = new Date('2026-01-15T10:30:00.000Z');
    const cursor = encodeCursor({ createdAt, id: 'title_42' });

    const decoded = decodeCursor(cursor);

    expect(decoded.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(decoded.id).toBe('title_42');
  });

  it('is opaque (not plain text)', () => {
    const cursor = encodeCursor({ createdAt: new Date(), id: 'title_1' });
    expect(cursor).not.toContain('title_1');
  });

  it('throws on garbage input', () => {
    expect(() => decodeCursor('not-a-real-cursor')).toThrow();
  });

  it('throws when the decoded id is empty', () => {
    const malformed = Buffer.from('2026-01-15T10:30:00.000Z|', 'utf8').toString('base64url');
    expect(() => decodeCursor(malformed)).toThrow();
  });

  it('throws when the decoded date is invalid', () => {
    const malformed = Buffer.from('not-a-date|title_1', 'utf8').toString('base64url');
    expect(() => decodeCursor(malformed)).toThrow();
  });
});
