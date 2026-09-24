import argon2 from 'argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { EmailAlreadyRegisteredError, InvalidRegisterInputError } from '../../src/domain/errors.js';
import { registerAccount } from '../../src/domain/registerAccount.js';
import { InMemoryAccountRepository } from './fakes/inMemoryAccountRepository.js';

describe('registerAccount', () => {
  let accountRepository: InMemoryAccountRepository;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
  });

  it('creates a pending_verification account with an argon2id password hash and a verification token', async () => {
    const { account, emailVerificationToken } = await registerAccount(
      { email: 'Jane@Example.com', password: 'correct-horse', accountType: 'PERSO' },
      { accountRepository },
    );

    expect(account.status).toBe('PENDING_VERIFICATION');
    expect(account.email).toBe('jane@example.com');
    expect(emailVerificationToken).toMatch(/^[0-9a-f]{64}$/);

    const stored = accountRepository.lastCreateInput;
    expect(stored?.passwordHash).toBeDefined();
    expect(stored?.passwordHash).not.toBe('correct-horse');
    expect(await argon2.verify(stored!.passwordHash, 'correct-horse')).toBe(true);
    expect(stored?.emailVerificationTokenHash).not.toBe(emailVerificationToken);
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
    const { account } = await registerAccount(
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
