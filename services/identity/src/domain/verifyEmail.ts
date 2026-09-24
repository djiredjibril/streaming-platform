import type { AccountRecord, AccountRepository } from './accountRepository.js';
import { InvalidOrExpiredTokenError } from './errors.js';
import { hashOpaqueToken } from './tokens.js';

export interface VerifyEmailDeps {
  accountRepository: AccountRepository;
}

/** Exchanges the mocked email verification token for an activated account. See registerAccount.ts for how the token is issued. */
export async function verifyEmail(rawToken: string, deps: VerifyEmailDeps): Promise<AccountRecord> {
  const pending = await deps.accountRepository.findPendingVerificationByTokenHash(
    hashOpaqueToken(rawToken),
  );
  if (!pending || pending.expiresAt.getTime() < Date.now()) {
    throw new InvalidOrExpiredTokenError();
  }

  return deps.accountRepository.activateAccount(pending.accountId);
}
