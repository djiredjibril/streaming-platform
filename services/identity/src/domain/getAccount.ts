import type { AccountRecord, AccountRepository } from './accountRepository.js';
import { AccountNotFoundError } from './errors.js';

export async function getAccount(accountId: string, accountRepository: AccountRepository): Promise<AccountRecord> {
  const account = await accountRepository.findById(accountId);
  if (!account) {
    throw new AccountNotFoundError();
  }
  return account;
}
