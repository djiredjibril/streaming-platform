import argon2 from 'argon2';
import type { AccountRepository, AccountRecord } from './accountRepository.js';
import type { RateLimiter } from './rateLimiter.js';
import { EmailAlreadyRegisteredError, InvalidRegisterInputError, RateLimitExceededError } from './errors.js';
import { registerInputSchema, type RegisterInput } from './schemas.js';
import { generateOpaqueToken } from './tokens.js';

export interface RegisterAccountDeps {
  accountRepository: AccountRepository;
  rateLimiter: RateLimiter;
}

export interface RegisterAccountResult {
  account: AccountRecord;
  /**
   * V1 mock only: normally this would be emailed, never returned to the
   * caller. See /proto/identity.proto, VerifyEmail, for why it's here.
   */
  emailVerificationToken: string;
}

const EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60;

/** Wider window than Login's: a shared network (university, office) can legitimately register several accounts; this only needs to stop mass account creation, not normal shared-IP usage. */
const REGISTER_RATE_LIMIT_MAX_ATTEMPTS = 5;
const REGISTER_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

/**
 * Registers a new account. Never activates it: every account is created
 * PENDING_VERIFICATION (docs/01-identity.md, "vérification d'email
 * obligatoire avant activation du compte"). Activation happens via
 * verifyEmail.ts, once the caller exchanges the returned token.
 * Rate-limited by IP (`ipAddress`, transport-derived — not part of the
 * Zod-validated `rawInput`, same reasoning as loginAccount.ts).
 */
export async function registerAccount(
  rawInput: unknown,
  ipAddress: string,
  deps: RegisterAccountDeps,
): Promise<RegisterAccountResult> {
  const rateLimit = await deps.rateLimiter.consume(
    `register:${ipAddress}`,
    REGISTER_RATE_LIMIT_MAX_ATTEMPTS,
    REGISTER_RATE_LIMIT_WINDOW_SECONDS,
  );
  if (!rateLimit.allowed) {
    throw new RateLimitExceededError(rateLimit.retryAfterSeconds);
  }

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
  const verificationToken = generateOpaqueToken();
  const emailVerificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000);

  const account = await deps.accountRepository.create({
    email: input.email,
    passwordHash,
    accountType: input.accountType,
    universityEmail: input.universityEmail,
    emailVerificationTokenHash: verificationToken.hash,
    emailVerificationExpiresAt,
  });

  return { account, emailVerificationToken: verificationToken.raw };
}
