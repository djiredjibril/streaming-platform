import type { AccountRepository } from './accountRepository.js';
import type { ProfileRecord, ProfileRepository } from './profileRepository.js';
import { AccountNotFoundError } from './errors.js';

export interface ListProfilesDeps {
  accountRepository: AccountRepository;
  profileRepository: ProfileRepository;
}

/** Lists every Profile on an account. Throws AccountNotFoundError rather than silently returning [] for an unknown accountId — defense in depth, matching getAccount.ts's pattern. */
export async function listProfiles(accountId: string, deps: ListProfilesDeps): Promise<ProfileRecord[]> {
  const account = await deps.accountRepository.findById(accountId);
  if (!account) {
    throw new AccountNotFoundError();
  }
  return deps.profileRepository.listByAccount(accountId);
}
