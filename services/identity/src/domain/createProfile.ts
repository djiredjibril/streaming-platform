import type { AccountRepository } from './accountRepository.js';
import type { ProfileRecord, ProfileRepository, ProfileRole } from './profileRepository.js';
import {
  AccountNotFoundError,
  AccountNotVerifiedError,
  AccountSuspendedError,
  InvalidProfileInputError,
  ProfileLimitExceededError,
} from './errors.js';
import { createProfileInputSchema } from './schemas.js';

export interface CreateProfileDeps {
  accountRepository: AccountRepository;
  profileRepository: ProfileRepository;
}

/**
 * Creates a Profile under an Account, applying the perso/famille/étudiant
 * distinction from docs/01-identity.md: PERSO/ETUDIANT accounts get exactly
 * one profile, FAMILLE accounts get many. The first profile on any account
 * is always OWNER (nobody else could grant that role yet); subsequent ones
 * (only reachable on FAMILLE, since PERSO/ETUDIANT are capped at one) get
 * KID or MEMBER depending on `isKidsProfile`.
 */
export async function createProfile(rawInput: unknown, deps: CreateProfileDeps): Promise<ProfileRecord> {
  const parsed = createProfileInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidProfileInputError(parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const input = parsed.data;

  const account = await deps.accountRepository.findById(input.accountId);
  if (!account) {
    throw new AccountNotFoundError();
  }
  if (account.status === 'PENDING_VERIFICATION') {
    throw new AccountNotVerifiedError();
  }
  if (account.status === 'SUSPENDED') {
    throw new AccountSuspendedError();
  }

  const existingCount = await deps.profileRepository.countByAccount(input.accountId);
  if (existingCount > 0 && account.accountType !== 'FAMILLE') {
    throw new ProfileLimitExceededError();
  }

  const role: ProfileRole = existingCount === 0 ? 'OWNER' : input.isKidsProfile ? 'KID' : 'MEMBER';

  return deps.profileRepository.create({
    accountId: input.accountId,
    displayName: input.displayName,
    isKidsProfile: input.isKidsProfile,
    role,
  });
}
