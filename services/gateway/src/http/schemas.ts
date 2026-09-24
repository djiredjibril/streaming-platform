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
