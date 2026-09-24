import { z } from 'zod';

/**
 * Shape of POST /auth/register's body. Deliberate defense-in-depth: Identity
 * revalidates everything server-side too (see services/AGENT.md §7,
 * "jamais de confiance implicite... même en interne"), but rejecting an
 * obviously malformed body here avoids an unnecessary gRPC round-trip.
 */
export const registerBodySchema = z.object({
  email: z.string(),
  password: z.string(),
  accountType: z.enum(['PERSO', 'FAMILLE', 'ETUDIANT']),
  universityEmail: z.string().optional(),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;

export const verifyEmailBodySchema = z.object({
  token: z.string(),
});

export type VerifyEmailBody = z.infer<typeof verifyEmailBodySchema>;

export const loginBodySchema = z.object({
  email: z.string(),
  password: z.string(),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const createProfileBodySchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  isKidsProfile: z.boolean(),
});

export type CreateProfileBody = z.infer<typeof createProfileBodySchema>;
