import type {
  AccountRecord,
  AccountRepository,
  CreateAccountInput,
  PendingVerification,
} from '../../../src/domain/accountRepository.js';

interface StoredAccount extends AccountRecord {
  emailVerificationTokenHash: string | null;
  emailVerificationExpiresAt: Date | null;
}

/** In-memory fake for unit-testing /domain functions without a real database. */
export class InMemoryAccountRepository implements AccountRepository {
  private accountsById = new Map<string, StoredAccount>();
  public lastCreateInput: CreateAccountInput | undefined;

  async findByEmail(email: string): Promise<AccountRecord | null> {
    for (const account of this.accountsById.values()) {
      if (account.email === email) return { ...account };
    }
    return null;
  }

  async findById(accountId: string): Promise<AccountRecord | null> {
    const account = this.accountsById.get(accountId);
    return account ? { ...account } : null;
  }

  async create(input: CreateAccountInput): Promise<AccountRecord> {
    this.lastCreateInput = input;
    const record: StoredAccount = {
      id: `acc_${this.accountsById.size + 1}`,
      email: input.email,
      accountType: input.accountType,
      status: 'PENDING_VERIFICATION',
      emailVerificationTokenHash: input.emailVerificationTokenHash,
      emailVerificationExpiresAt: input.emailVerificationExpiresAt,
    };
    this.accountsById.set(record.id, record);
    return { ...record };
  }

  async findPendingVerificationByTokenHash(tokenHash: string): Promise<PendingVerification | null> {
    for (const account of this.accountsById.values()) {
      if (account.status === 'PENDING_VERIFICATION' && account.emailVerificationTokenHash === tokenHash) {
        return { accountId: account.id, expiresAt: account.emailVerificationExpiresAt! };
      }
    }
    return null;
  }

  async activateAccount(accountId: string): Promise<AccountRecord> {
    const account = this.accountsById.get(accountId);
    if (!account) throw new Error(`No account ${accountId}`);
    account.status = 'ACTIVE';
    account.emailVerificationTokenHash = null;
    account.emailVerificationExpiresAt = null;
    return { ...account };
  }
}
