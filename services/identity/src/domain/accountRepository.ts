import type { AccountTypeInput } from './schemas.js';

export interface AccountRecord {
  id: string;
  email: string;
  accountType: AccountTypeInput;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  /** Minimal admin role — see prisma/schema.prisma's Account.isAdmin comment for how it's granted. */
  isAdmin: boolean;
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

/** AccountRecord plus the password hash — returned only to loginAccount, never to a transport layer. */
export interface AccountCredentials extends AccountRecord {
  passwordHash: string | null;
}

/**
 * Port implemented by the Prisma-backed adapter in /infra. Kept here (in
 * /domain) so domain functions have zero dependency on Prisma and can be
 * unit-tested with an in-memory fake.
 */
export interface AccountRepository {
  findByEmail(email: string): Promise<AccountRecord | null>;
  findById(accountId: string): Promise<AccountRecord | null>;
  /** Includes the password hash — only loginAccount.ts should call this. */
  findCredentialsByEmail(email: string): Promise<AccountCredentials | null>;
  create(input: CreateAccountInput): Promise<AccountRecord>;
  /** Looks up a PENDING_VERIFICATION account by the hash of its mocked verification token (see domain/tokens.ts). */
  findPendingVerificationByTokenHash(tokenHash: string): Promise<PendingVerification | null>;
  /** Sets status -> ACTIVE and clears the verification token fields. */
  activateAccount(accountId: string): Promise<AccountRecord>;
}
