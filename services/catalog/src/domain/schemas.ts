import { z } from 'zod';

export const titleTypeSchema = z.enum(['MOVIE', 'SERIES', 'SHORT']);
export const contentRatingSchema = z.enum(['G', 'PG', 'PG_13', 'R', 'NC_17', 'UNRATED']);

/**
 * Validates CreateTitle's input shape. `runtimeMinutes` is required for
 * MOVIE/SHORT and rejected for SERIES (docs/03-catalog.md: runtime lives on
 * Episode for a series, once that feature exists) — enforced here rather
 * than in Prisma/proto since it's a cross-field rule, not a single-field
 * constraint.
 */
export const createTitleInputSchema = z
  .object({
    type: titleTypeSchema,
    originalTitle: z.string().trim().min(1, 'originalTitle is required'),
    synopsis: z.string().trim().min(1, 'synopsis is required'),
    releaseYear: z.number().int().min(1888).max(new Date().getFullYear() + 5),
    rating: contentRatingSchema,
    runtimeMinutes: z.number().int().positive().optional(),
    posterUrl: z.string().url().optional(),
    backdropUrl: z.string().url().optional(),
    // Trimmed, deduplicated (order-preserving, case-sensitive), capped at
    // 10 — a title tagged with dozens of genres is almost certainly a data
    // entry mistake, not a real catalog need.
    genres: z
      .array(z.string().trim().min(1, 'a genre name cannot be empty'))
      .max(10, 'a title can have at most 10 genres')
      .transform((names) => [...new Set(names)])
      .optional()
      .default([]),
  })
  .superRefine((input, ctx) => {
    if (input.type === 'SERIES' && input.runtimeMinutes !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'runtimeMinutes is not applicable to a SERIES' });
    }
    if (input.type !== 'SERIES' && input.runtimeMinutes === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'runtimeMinutes is required for MOVIE/SHORT' });
    }
  });

export type CreateTitleInput = z.infer<typeof createTitleInputSchema>;
export type TitleTypeInput = z.infer<typeof titleTypeSchema>;
export type ContentRatingInput = z.infer<typeof contentRatingSchema>;

/** Validates AttachMediaAsset's input shape — `url` just needs to be a well-formed URL; V1 trusts it points at a real playable file (see prisma/schema.prisma's MediaAsset comment). `titleId` isn't format-checked here (not this layer's concern, same as every other id in this domain) — an unknown/malformed one surfaces as TitleNotFoundError either way. */
export const attachMediaAssetInputSchema = z.object({
  titleId: z.string().min(1, 'titleId is required'),
  url: z.string().url(),
});

export type AttachMediaAssetInput = z.infer<typeof attachMediaAssetInputSchema>;

/** Validates BrowseTitles' input shape. `cursor` is checked here only for "non-empty string" — its actual (createdAt, id) decoding happens in domain/cursor.ts, called from browseTitles.ts. */
export const browseTitlesInputSchema = z.object({
  genre: z.string().trim().min(1).optional(),
  type: titleTypeSchema.optional(),
  cursor: z.string().min(1).optional(),
  // Capped at 50 — an unbounded limit would let a caller pull the entire
  // catalog in one request, defeating the point of paginating at all.
  limit: z.number().int().min(1).max(50).default(20),
});

export type BrowseTitlesInput = z.infer<typeof browseTitlesInputSchema>;
