import type { PrismaClient } from '../../generated/prisma-client/index.js';
import type {
  AccountCredentials,
  AccountRecord,
  AccountRepository,
  CreateAccountInput,
  PendingVerification,
} from '../domain/accountRepository.js';

/** Prisma-backed AccountRepository — the only file in this service that issues SQL (via Prisma) for accounts. */
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<AccountRecord | null> {
    const account = await this.prisma.account.findUnique({ where: { email } });
    return account ? toAccountRecord(account) : null;
  }

  async findById(accountId: string): Promise<AccountRecord | null> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    return account ? toAccountRecord(account) : null;
  }

  async findCredentialsByEmail(email: string): Promise<AccountCredentials | null> {
    const account = await this.prisma.account.findUnique({ where: { email } });
    return account ? { ...toAccountRecord(account), passwordHash: account.passwordHash } : null;
  }

  /** Creates the Account row and, when `universityEmail` is set, a linked StudentVerification row in PENDING status (see docs/01-identity.md). */
  async create(input: CreateAccountInput): Promise<AccountRecord> {
    const account = await this.prisma.account.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        accountType: input.accountType,
        emailVerificationTokenHash: input.emailVerificationTokenHash,
        emailVerificationExpiresAt: input.emailVerificationExpiresAt,
        ...(input.universityEmail
          ? {
              studentVerification: {
                create: { universityEmail: input.universityEmail },
              },
            }
          : {}),
      },
    });
    return toAccountRecord(account);
  }

  async findPendingVerificationByTokenHash(tokenHash: string): Promise<PendingVerification | null> {
    const account = await this.prisma.account.findFirst({
      where: { emailVerificationTokenHash: tokenHash, status: 'PENDING_VERIFICATION' },
      select: { id: true, emailVerificationExpiresAt: true },
    });
    if (!account || !account.emailVerificationExpiresAt) return null;
    return { accountId: account.id, expiresAt: account.emailVerificationExpiresAt };
  }

  async activateAccount(accountId: string): Promise<AccountRecord> {
    const account = await this.prisma.account.update({
      where: { id: accountId },
      data: {
        status: 'ACTIVE',
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });
    return toAccountRecord(account);
  }
}

function toAccountRecord(account: {
  id: string;
  email: string;
  accountType: string;
  status: string;
  isAdmin: boolean;
}): AccountRecord {
  return {
    id: account.id,
    email: account.email,
    accountType: account.accountType as AccountRecord['accountType'],
    status: account.status as AccountRecord['status'],
    isAdmin: account.isAdmin,
  };
}
