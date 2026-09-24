import argon2 from 'argon2';
import type { AccountRepository, AccountRecord } from './accountRepository.js';
import { EmailAlreadyRegisteredError, InvalidRegisterInputError } from './errors.js';
import { registerInputSchema, type RegisterInput } from './schemas.js';

export interface RegisterAccountDeps {
  accountRepository: AccountRepository;
}

/**
 * Registers a new account. Never activates it: every account is created
 * PENDING_VERIFICATION (docs/01-identity.md, "vérification d'email
 * obligatoire avant activation du compte"). Issuing a session is the
 * responsibility of the Login feature, once a verification step exists.
 */
export async function registerAccount(
  rawInput: unknown,
  deps: RegisterAccountDeps,
): Promise<AccountRecord> {
  const parsed = registerInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidRegisterInputError(parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const input: RegisterInput = parsed.data;

  const existing = await deps.accountRepository.findByEmail(input.email);
  if (existing) {
    throw new EmailAlreadyRegisteredError();
  }

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

  return deps.accountRepository.create({
    email: input.email,
    passwordHash,
    accountType: input.accountType,
    universityEmail: input.universityEmail,
  });
}
