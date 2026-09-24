import { beforeEach, describe, expect, it } from 'vitest';
import { AccountNotFoundError } from '../../src/domain/errors.js';
import { getAccount } from '../../src/domain/getAccount.js';
import { registerAccount } from '../../src/domain/registerAccount.js';
import { InMemoryAccountRepository } from './fakes/inMemoryAccountRepository.js';

describe('getAccount', () => {
  let accountRepository: InMemoryAccountRepository;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
  });

  it('returns the account by id', async () => {
    const { account } = await registerAccount(
      { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
      { accountRepository },
    );

    const result = await getAccount(account.id, accountRepository);

    expect(result).toEqual(account);
  });

  it('rejects an unknown id', async () => {
    await expect(getAccount('nonexistent', accountRepository)).rejects.toBeInstanceOf(AccountNotFoundError);
  });
});
