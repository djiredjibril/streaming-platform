/**
 * Generates a public, URL-safe slug from a title and release year (e.g.
 * "The Matrix" + 1999 -> "the-matrix-1999") — see docs/03-catalog.md,
 * "Slugs et identifiants stables". The year is included specifically to
 * reduce accidental collisions between unrelated titles that share a name
 * (remakes, franchises) without needing a random suffix.
 */
export function slugify(originalTitle: string, releaseYear: number): string {
  const base = originalTitle
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics left by NFKD normalization
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base}-${releaseYear}`;
}
