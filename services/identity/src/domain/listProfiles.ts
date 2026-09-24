import type { AccountRepository } from './accountRepository.js';
import type { ProfileRecord, ProfileRepository } from './profileRepository.js';
import { AccountNotFoundError } from './errors.js';

export interface ListProfilesDeps {
  accountRepository: AccountRepository;
  profileRepository: ProfileRepository;
}

export async function listProfiles(accountId: string, deps: ListProfilesDeps): Promise<ProfileRecord[]> {
  const account = await deps.accountRepository.findById(accountId);
  if (!account) {
    throw new AccountNotFoundError();
  }
  return deps.profileRepository.listByAccount(accountId);
}
