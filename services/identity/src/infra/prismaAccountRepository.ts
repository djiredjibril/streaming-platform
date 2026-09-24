import type { PrismaClient } from '@prisma/client';
import type {
  AccountRecord,
  AccountRepository,
  CreateAccountInput,
} from '../domain/accountRepository.js';

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<AccountRecord | null> {
    const account = await this.prisma.account.findUnique({ where: { email } });
    return account ? toAccountRecord(account) : null;
  }

  async create(input: CreateAccountInput): Promise<AccountRecord> {
    const account = await this.prisma.account.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        accountType: input.accountType,
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
}

function toAccountRecord(account: {
  id: string;
  email: string;
  accountType: string;
  status: string;
}): AccountRecord {
  return {
    id: account.id,
    email: account.email,
    accountType: account.accountType as AccountRecord['accountType'],
    status: account.status as AccountRecord['status'],
  };
}
