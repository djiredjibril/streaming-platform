import { z } from 'zod';

export const accountTypeSchema = z.enum(['PERSO', 'FAMILLE', 'ETUDIANT']);

export type AccountTypeInput = z.infer<typeof accountTypeSchema>;

/**
 * A regex check on the university email domain is not a real verification —
 * it's the minimal shape validation before the (currently unbuilt)
 * verification flow runs. See docs/01-identity.md, "Bonnes pratiques
 * sécurité": don't trust a `@*.edu`-style regex as proof of eligibility.
 */
export const registerInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8),
    accountType: accountTypeSchema,
    universityEmail: z.string().trim().toLowerCase().email().optional(),
  })
  .refine(
    (input) => input.accountType !== 'ETUDIANT' || Boolean(input.universityEmail),
    {
      message: 'universityEmail is required when accountType is ETUDIANT',
      path: ['universityEmail'],
    },
  );

export type RegisterInput = z.infer<typeof registerInputSchema>;

export const createProfileInputSchema = z.object({
  accountId: z.string(),
  displayName: z.string().trim().min(1).max(100),
  isKidsProfile: z.boolean(),
});

export type CreateProfileInput = z.infer<typeof createProfileInputSchema>;
