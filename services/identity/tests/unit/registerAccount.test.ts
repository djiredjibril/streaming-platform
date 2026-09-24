import argon2 from 'argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AccountRecord, AccountRepository } from '../../src/domain/accountRepository.js';
import { EmailAlreadyRegisteredError, InvalidRegisterInputError } from '../../src/domain/errors.js';
import { registerAccount } from '../../src/domain/registerAccount.js';

class InMemoryAccountRepository implements AccountRepository {
  private accounts = new Map<string, AccountRecord>();
  public lastCreateInput: Parameters<AccountRepository['create']>[0] | undefined;

  async findByEmail(email: string): Promise<AccountRecord | null> {
    return this.accounts.get(email) ?? null;
  }

  async create(input: Parameters<AccountRepository['create']>[0]): Promise<AccountRecord> {
    this.lastCreateInput = input;
    const record: AccountRecord = {
      id: `acc_${this.accounts.size + 1}`,
      email: input.email,
      accountType: input.accountType,
      status: 'PENDING_VERIFICATION',
    };
    this.accounts.set(input.email, record);
    return record;
  }
}

describe('registerAccount', () => {
  let accountRepository: InMemoryAccountRepository;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
  });

  it('creates a pending_verification account with an argon2id password hash', async () => {
    const account = await registerAccount(
      { email: 'Jane@Example.com', password: 'correct-horse', accountType: 'PERSO' },
      { accountRepository },
    );

    expect(account.status).toBe('PENDING_VERIFICATION');
    expect(account.email).toBe('jane@example.com');

    const stored = accountRepository.lastCreateInput;
    expect(stored?.passwordHash).toBeDefined();
    expect(stored?.passwordHash).not.toBe('correct-horse');
    expect(await argon2.verify(stored!.passwordHash, 'correct-horse')).toBe(true);
  });

  it('rejects an invalid email', async () => {
    await expect(
      registerAccount(
        { email: 'not-an-email', password: 'correct-horse', accountType: 'PERSO' },
        { accountRepository },
      ),
    ).rejects.toBeInstanceOf(InvalidRegisterInputError);
  });

  it('rejects a password shorter than 8 characters', async () => {
    await expect(
      registerAccount(
        { email: 'jane@example.com', password: 'short', accountType: 'PERSO' },
        { accountRepository },
      ),
    ).rejects.toBeInstanceOf(InvalidRegisterInputError);
  });

  it('rejects ETUDIANT accounts without a universityEmail', async () => {
    await expect(
      registerAccount(
        { email: 'jane@example.com', password: 'correct-horse', accountType: 'ETUDIANT' },
        { accountRepository },
      ),
    ).rejects.toBeInstanceOf(InvalidRegisterInputError);
  });

  it('accepts ETUDIANT accounts with a universityEmail', async () => {
    const account = await registerAccount(
      {
        email: 'jane@example.com',
        password: 'correct-horse',
        accountType: 'ETUDIANT',
        universityEmail: 'jane@university.edu',
      },
      { accountRepository },
    );

    expect(account.status).toBe('PENDING_VERIFICATION');
    expect(accountRepository.lastCreateInput?.universityEmail).toBe('jane@university.edu');
  });

  it('rejects a duplicate email', async () => {
    await registerAccount(
      { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
      { accountRepository },
    );

    await expect(
      registerAccount(
        { email: 'jane@example.com', password: 'another-password', accountType: 'PERSO' },
        { accountRepository },
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });
});
