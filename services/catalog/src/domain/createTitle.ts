import { InvalidCreateTitleInputError, SlugAlreadyExistsError } from './errors.js';
import { createTitleInputSchema } from './schemas.js';
import { slugify } from './slug.js';
import type { TitleRecord, TitleRepository } from './titleRepository.js';

export interface CreateTitleDeps {
  titleRepository: TitleRepository;
}

/**
 * Creates a Title in `draft` status — never `published` directly, so a
 * newly created title is never accidentally browsable/searchable before an
 * operator explicitly publishes it (a future feature; there is no publish
 * mutation yet in this V1 slice). See docs/03-catalog.md, "Bonnes
 * pratiques", and catalog.proto's CreateTitle comment for the trust
 * boundary (admin-check happens in the Gateway, not here).
 */
export async function createTitle(rawInput: unknown, deps: CreateTitleDeps): Promise<TitleRecord> {
  const parsed = createTitleInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidCreateTitleInputError(parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const input = parsed.data;

  const slug = slugify(input.originalTitle, input.releaseYear);
  const existing = await deps.titleRepository.findBySlug(slug);
  if (existing) {
    throw new SlugAlreadyExistsError(slug);
  }

  return deps.titleRepository.create({ ...input, slug });
}
