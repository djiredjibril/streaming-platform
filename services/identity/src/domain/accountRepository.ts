import type { AccountTypeInput } from './schemas.js';

export interface AccountRecord {
  id: string;
  email: string;
  accountType: AccountTypeInput;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
}

export interface CreateAccountInput {
  email: string;
  passwordHash: string;
  accountType: AccountTypeInput;
  universityEmail?: string;
  emailVerificationTokenHash: string;
  emailVerificationExpiresAt: Date;
}

export interface PendingVerification {
  accountId: string;
  expiresAt: Date;
}

/**
 * Port implemented by the Prisma-backed adapter in /infra. Kept here (in
 * /domain) so domain functions have zero dependency on Prisma and can be
 * unit-tested with an in-memory fake.
 */
export interface AccountRepository {
  findByEmail(email: string): Promise<AccountRecord | null>;
  findById(accountId: string): Promise<AccountRecord | null>;
  create(input: CreateAccountInput): Promise<AccountRecord>;
  /** Looks up a PENDING_VERIFICATION account by the hash of its mocked verification token (see domain/tokens.ts). */
  findPendingVerificationByTokenHash(tokenHash: string): Promise<PendingVerification | null>;
  /** Sets status -> ACTIVE and clears the verification token fields. */
  activateAccount(accountId: string): Promise<AccountRecord>;
}
