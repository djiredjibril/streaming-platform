import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidOrExpiredTokenError } from '../../src/domain/errors.js';
import { registerAccount } from '../../src/domain/registerAccount.js';
import { verifyEmail } from '../../src/domain/verifyEmail.js';
import { InMemoryAccountRepository } from './fakes/inMemoryAccountRepository.js';

describe('verifyEmail', () => {
  let accountRepository: InMemoryAccountRepository;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
  });

  it('activates the account when the token matches', async () => {
    const { emailVerificationToken } = await registerAccount(
      { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
      { accountRepository },
    );

    const account = await verifyEmail(emailVerificationToken, { accountRepository });

    expect(account.status).toBe('ACTIVE');
  });

  it('rejects an unknown token', async () => {
    await expect(verifyEmail('not-a-real-token', { accountRepository })).rejects.toBeInstanceOf(
      InvalidOrExpiredTokenError,
    );
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers();
    try {
      const { emailVerificationToken } = await registerAccount(
        { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
        { accountRepository },
      );

      vi.advanceTimersByTime(25 * 60 * 60 * 1000); // > 24h TTL

      await expect(verifyEmail(emailVerificationToken, { accountRepository })).rejects.toBeInstanceOf(
        InvalidOrExpiredTokenError,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects reusing a token after the account is already active', async () => {
    const { emailVerificationToken } = await registerAccount(
      { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
      { accountRepository },
    );

    await verifyEmail(emailVerificationToken, { accountRepository });

    await expect(verifyEmail(emailVerificationToken, { accountRepository })).rejects.toBeInstanceOf(
      InvalidOrExpiredTokenError,
    );
  });
});
