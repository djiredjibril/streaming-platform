import { beforeEach, describe, expect, it } from 'vitest';
import { AccountNotFoundError } from '../../src/domain/errors.js';
import { getAccount } from '../../src/domain/getAccount.js';
import { registerAccount } from '../../src/domain/registerAccount.js';
import { InMemoryAccountRepository } from './fakes/inMemoryAccountRepository.js';
import { InMemoryRateLimiter } from './fakes/inMemoryRateLimiter.js';

describe('getAccount', () => {
  let accountRepository: InMemoryAccountRepository;
  let rateLimiter: InMemoryRateLimiter;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
    rateLimiter = new InMemoryRateLimiter();
  });

  it('returns the account by id', async () => {
    const { account } = await registerAccount(
      { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
      '127.0.0.1',
      { accountRepository, rateLimiter },
    );

    const result = await getAccount(account.id, accountRepository);

    expect(result).toEqual(account);
  });

  it('rejects an unknown id', async () => {
    await expect(getAccount('nonexistent', accountRepository)).rejects.toBeInstanceOf(AccountNotFoundError);
  });
});
