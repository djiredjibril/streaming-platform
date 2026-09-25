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
