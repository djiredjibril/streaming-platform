import { beforeEach, describe, expect, it } from 'vitest';
import {
  AccountNotFoundError,
  AccountNotVerifiedError,
  AccountSuspendedError,
  ProfileLimitExceededError,
} from '../../src/domain/errors.js';
import { createProfile } from '../../src/domain/createProfile.js';
import { registerAccount } from '../../src/domain/registerAccount.js';
import { InMemoryAccountRepository } from './fakes/inMemoryAccountRepository.js';
import { InMemoryProfileRepository } from './fakes/inMemoryProfileRepository.js';
import { InMemoryRateLimiter } from './fakes/inMemoryRateLimiter.js';

describe('createProfile', () => {
  let accountRepository: InMemoryAccountRepository;
  let profileRepository: InMemoryProfileRepository;
  let rateLimiter: InMemoryRateLimiter;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
    profileRepository = new InMemoryProfileRepository();
    rateLimiter = new InMemoryRateLimiter();
  });

  async function activeAccount(accountType: 'PERSO' | 'FAMILLE' | 'ETUDIANT') {
    const { account } = await registerAccount(
      {
        email: `${accountType.toLowerCase()}@example.com`,
        password: 'correct-horse',
        accountType,
        universityEmail: accountType === 'ETUDIANT' ? 'jane@university.edu' : undefined,
      },
      '127.0.0.1',
      { accountRepository, rateLimiter },
    );
    accountRepository.forceStatus(account.id, 'ACTIVE');
    return account;
  }

  it('assigns OWNER to the first profile on an account', async () => {
    const account = await activeAccount('PERSO');

    const profile = await createProfile(
      { accountId: account.id, displayName: 'Jane', isKidsProfile: false },
      { accountRepository, profileRepository },
    );

    expect(profileRepository.roleFor(profile.id)).toBe('OWNER');
  });

  it('rejects a second profile on a PERSO account', async () => {
    const account = await activeAccount('PERSO');
    await createProfile({ accountId: account.id, displayName: 'Jane', isKidsProfile: false }, { accountRepository, profileRepository });

    await expect(
      createProfile({ accountId: account.id, displayName: 'Second', isKidsProfile: false }, { accountRepository, profileRepository }),
    ).rejects.toBeInstanceOf(ProfileLimitExceededError);
  });

  it('rejects a second profile on an ETUDIANT account', async () => {
    const account = await activeAccount('ETUDIANT');
    await createProfile({ accountId: account.id, displayName: 'Jane', isKidsProfile: false }, { accountRepository, profileRepository });

    await expect(
      createProfile({ accountId: account.id, displayName: 'Second', isKidsProfile: false }, { accountRepository, profileRepository }),
    ).rejects.toBeInstanceOf(ProfileLimitExceededError);
  });

  it('allows multiple profiles on a FAMILLE account, assigning MEMBER/KID after the first', async () => {
    const account = await activeAccount('FAMILLE');
    const first = await createProfile(
      { accountId: account.id, displayName: 'Parent', isKidsProfile: false },
      { accountRepository, profileRepository },
    );
    const member = await createProfile(
      { accountId: account.id, displayName: 'Partner', isKidsProfile: false },
      { accountRepository, profileRepository },
    );
    const kid = await createProfile(
      { accountId: account.id, displayName: 'Kid', isKidsProfile: true },
      { accountRepository, profileRepository },
    );

    expect(profileRepository.roleFor(first.id)).toBe('OWNER');
    expect(profileRepository.roleFor(member.id)).toBe('MEMBER');
    expect(profileRepository.roleFor(kid.id)).toBe('KID');
  });

  it('rejects an unknown account', async () => {
    await expect(
      createProfile({ accountId: 'nonexistent', displayName: 'Jane', isKidsProfile: false }, { accountRepository, profileRepository }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });

  it('rejects a PENDING_VERIFICATION account', async () => {
    const { account } = await registerAccount(
      { email: 'pending@example.com', password: 'correct-horse', accountType: 'PERSO' },
      '127.0.0.1',
      { accountRepository, rateLimiter },
    );

    await expect(
      createProfile({ accountId: account.id, displayName: 'Jane', isKidsProfile: false }, { accountRepository, profileRepository }),
    ).rejects.toBeInstanceOf(AccountNotVerifiedError);
  });

  it('rejects a SUSPENDED account', async () => {
    const account = await activeAccount('PERSO');
    accountRepository.forceStatus(account.id, 'SUSPENDED');

    await expect(
      createProfile({ accountId: account.id, displayName: 'Jane', isKidsProfile: false }, { accountRepository, profileRepository }),
    ).rejects.toBeInstanceOf(AccountSuspendedError);
  });
});
