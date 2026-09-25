import type {
  AccountCredentials,
  AccountRecord,
  AccountRepository,
  CreateAccountInput,
  PendingVerification,
} from '../../../src/domain/accountRepository.js';

interface StoredAccount extends AccountRecord {
  passwordHash: string | null;
  emailVerificationTokenHash: string | null;
  emailVerificationExpiresAt: Date | null;
}

/** In-memory fake for unit-testing /domain functions without a real database. */
export class InMemoryAccountRepository implements AccountRepository {
  private accountsById = new Map<string, StoredAccount>();
  public lastCreateInput: CreateAccountInput | undefined;

  async findByEmail(email: string): Promise<AccountRecord | null> {
    for (const account of this.accountsById.values()) {
      if (account.email === email) return toRecord(account);
    }
    return null;
  }

  async findById(accountId: string): Promise<AccountRecord | null> {
    const account = this.accountsById.get(accountId);
    return account ? toRecord(account) : null;
  }

  async findCredentialsByEmail(email: string): Promise<AccountCredentials | null> {
    for (const account of this.accountsById.values()) {
      if (account.email === email) return { ...toRecord(account), passwordHash: account.passwordHash };
    }
    return null;
  }

  async create(input: CreateAccountInput): Promise<AccountRecord> {
    this.lastCreateInput = input;
    const record: StoredAccount = {
      id: `acc_${this.accountsById.size + 1}`,
      email: input.email,
      accountType: input.accountType,
      status: 'PENDING_VERIFICATION',
      isAdmin: false,
      passwordHash: input.passwordHash,
      emailVerificationTokenHash: input.emailVerificationTokenHash,
      emailVerificationExpiresAt: input.emailVerificationExpiresAt,
    };
    this.accountsById.set(record.id, record);
    return toRecord(record);
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
    const account = this.mustGet(accountId);
    account.status = 'ACTIVE';
    account.emailVerificationTokenHash = null;
    account.emailVerificationExpiresAt = null;
    return toRecord(account);
  }

  /** Test-only helper: bypasses verifyEmail to set a status directly (e.g. simulating a SUSPENDED account for loginAccount tests). */
  forceStatus(accountId: string, status: AccountRecord['status']): void {
    this.mustGet(accountId).status = status;
  }

  /** Test-only helper: simulates the direct-DB-write admin grant (no self-service path exists — see prisma/schema.prisma's Account.isAdmin comment). */
  forceAdmin(accountId: string, isAdmin: boolean): void {
    this.mustGet(accountId).isAdmin = isAdmin;
  }

  private mustGet(accountId: string): StoredAccount {
    const account = this.accountsById.get(accountId);
    if (!account) throw new Error(`No account ${accountId}`);
    return account;
  }
}

function toRecord(account: StoredAccount): AccountRecord {
  return {
    id: account.id,
    email: account.email,
    accountType: account.accountType,
    status: account.status,
    isAdmin: account.isAdmin,
  };
}
