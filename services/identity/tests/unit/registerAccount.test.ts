import argon2 from 'argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EmailAlreadyRegisteredError,
  InvalidRegisterInputError,
  RateLimitExceededError,
} from '../../src/domain/errors.js';
import { registerAccount } from '../../src/domain/registerAccount.js';
import { InMemoryAccountRepository } from './fakes/inMemoryAccountRepository.js';
import { InMemoryRateLimiter } from './fakes/inMemoryRateLimiter.js';

const IP = '127.0.0.1';

describe('registerAccount', () => {
  let accountRepository: InMemoryAccountRepository;
  let rateLimiter: InMemoryRateLimiter;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
    rateLimiter = new InMemoryRateLimiter();
  });

  it('creates a pending_verification account with an argon2id password hash and a verification token', async () => {
    const { account, emailVerificationToken } = await registerAccount(
      { email: 'Jane@Example.com', password: 'correct-horse', accountType: 'PERSO' },
      IP,
      { accountRepository, rateLimiter },
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
        IP,
        { accountRepository, rateLimiter },
      ),
    ).rejects.toBeInstanceOf(InvalidRegisterInputError);
  });

  it('rejects a password shorter than 8 characters', async () => {
    await expect(
      registerAccount(
        { email: 'jane@example.com', password: 'short', accountType: 'PERSO' },
        IP,
        { accountRepository, rateLimiter },
      ),
    ).rejects.toBeInstanceOf(InvalidRegisterInputError);
  });

  it('rejects ETUDIANT accounts without a universityEmail', async () => {
    await expect(
      registerAccount(
        { email: 'jane@example.com', password: 'correct-horse', accountType: 'ETUDIANT' },
        IP,
        { accountRepository, rateLimiter },
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
      IP,
      { accountRepository, rateLimiter },
    );

    expect(account.status).toBe('PENDING_VERIFICATION');
    expect(accountRepository.lastCreateInput?.universityEmail).toBe('jane@university.edu');
  });

  it('rejects a duplicate email', async () => {
    await registerAccount(
      { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
      IP,
      { accountRepository, rateLimiter },
    );

    await expect(
      registerAccount(
        { email: 'jane@example.com', password: 'another-password', accountType: 'PERSO' },
        IP,
        { accountRepository, rateLimiter },
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('rate-limits by IP: the 6th registration attempt within the window is rejected', async () => {
    for (let i = 0; i < 5; i++) {
      await registerAccount(
        { email: `user${i}@example.com`, password: 'correct-horse', accountType: 'PERSO' },
        IP,
        { accountRepository, rateLimiter },
      );
    }

    const attempt = registerAccount(
      { email: 'user5@example.com', password: 'correct-horse', accountType: 'PERSO' },
      IP,
      { accountRepository, rateLimiter },
    );
    await expect(attempt).rejects.toBeInstanceOf(RateLimitExceededError);
    await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: expect.any(Number) });
  });
});
