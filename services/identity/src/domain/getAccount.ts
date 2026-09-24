import type { AccountRecord, AccountRepository } from './accountRepository.js';
import { AccountNotFoundError } from './errors.js';

/** Looks up an account by id. Throws AccountNotFoundError rather than returning null — callers (GetAccount RPC) always expect a resolved account or an explicit NOT_FOUND. */
export async function getAccount(accountId: string, accountRepository: AccountRepository): Promise<AccountRecord> {
  const account = await accountRepository.findById(accountId);
  if (!account) {
    throw new AccountNotFoundError();
  }
  return account;
}
