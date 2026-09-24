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
}

/**
 * Port implemented by the Prisma-backed adapter in /infra. Kept here (in
 * /domain) so registerAccount.ts has zero dependency on Prisma and can be
 * unit-tested with an in-memory fake.
 */
export interface AccountRepository {
  findByEmail(email: string): Promise<AccountRecord | null>;
  create(input: CreateAccountInput): Promise<AccountRecord>;
}
