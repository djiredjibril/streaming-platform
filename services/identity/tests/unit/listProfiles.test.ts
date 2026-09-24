import { beforeEach, describe, expect, it } from 'vitest';
import { AccountNotFoundError } from '../../src/domain/errors.js';
import { createProfile } from '../../src/domain/createProfile.js';
import { listProfiles } from '../../src/domain/listProfiles.js';
import { registerAccount } from '../../src/domain/registerAccount.js';
import { InMemoryAccountRepository } from './fakes/inMemoryAccountRepository.js';
import { InMemoryProfileRepository } from './fakes/inMemoryProfileRepository.js';

describe('listProfiles', () => {
  let accountRepository: InMemoryAccountRepository;
  let profileRepository: InMemoryProfileRepository;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
    profileRepository = new InMemoryProfileRepository();
  });

  it('returns every profile for the account', async () => {
    const { account } = await registerAccount(
      { email: 'jane@example.com', password: 'correct-horse', accountType: 'FAMILLE' },
      { accountRepository },
    );
    accountRepository.forceStatus(account.id, 'ACTIVE');
    await createProfile({ accountId: account.id, displayName: 'Parent', isKidsProfile: false }, { accountRepository, profileRepository });
    await createProfile({ accountId: account.id, displayName: 'Kid', isKidsProfile: true }, { accountRepository, profileRepository });

    const profiles = await listProfiles(account.id, { accountRepository, profileRepository });

    expect(profiles).toHaveLength(2);
    expect(profiles.map((p) => p.displayName).sort()).toEqual(['Kid', 'Parent']);
  });

  it('returns an empty array when the account has no profiles yet', async () => {
    const { account } = await registerAccount(
      { email: 'jane@example.com', password: 'correct-horse', accountType: 'PERSO' },
      { accountRepository },
    );

    const profiles = await listProfiles(account.id, { accountRepository, profileRepository });

    expect(profiles).toEqual([]);
  });

  it('rejects an unknown account', async () => {
    await expect(listProfiles('nonexistent', { accountRepository, profileRepository })).rejects.toBeInstanceOf(
      AccountNotFoundError,
    );
  });
});
