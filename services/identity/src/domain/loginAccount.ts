import argon2 from 'argon2';
import type { AccountRecord, AccountRepository } from './accountRepository.js';
import type { AuditLogRepository } from './auditLogRepository.js';
import type { RateLimiter } from './rateLimiter.js';
import type { RefreshTokenRepository } from './refreshTokenRepository.js';
import {
  AccountNotVerifiedError,
  AccountSuspendedError,
  InvalidCredentialsError,
  RateLimitExceededError,
} from './errors.js';
import { generateOpaqueToken, signAccessToken } from './tokens.js';

export interface LoginInput {
  email: string;
  password: string;
  ipAddress: string;
}

export interface LoginDeps {
  accountRepository: AccountRepository;
  refreshTokenRepository: RefreshTokenRepository;
  auditLogRepository: AuditLogRepository;
  rateLimiter: RateLimiter;
  jwtSecret: string;
}

export interface LoginResult {
  account: AccountRecord;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Brute-force protection (01-identity.md, "Bonnes pratiques sécurité") — keyed by IP, not email, so one attacker can't lock out a victim's account by spamming failed attempts against it. */
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

/**
 * Authenticates by email/password and, on success, issues a JWT access
 * token plus an opaque refresh token (stored hashed). Rejects
 * PENDING_VERIFICATION/SUSPENDED accounts. Every attempt is audited
 * (LOGIN_SUCCESS/LOGIN_FAILED) — this is why `ipAddress` is required input
 * rather than optional telemetry. Rate-limited by IP before anything else
 * runs, so a locked-out caller never even reaches the password check.
 */
export async function loginAccount(input: LoginInput, deps: LoginDeps): Promise<LoginResult> {
  const rateLimit = await deps.rateLimiter.consume(
    `login:${input.ipAddress}`,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    LOGIN_RATE_LIMIT_WINDOW_SECONDS,
  );
  if (!rateLimit.allowed) {
    throw new RateLimitExceededError(rateLimit.retryAfterSeconds);
  }

  const credentials = await deps.accountRepository.findCredentialsByEmail(input.email);
  const passwordMatches =
    credentials?.passwordHash != null && (await argon2.verify(credentials.passwordHash, input.password));

  if (!credentials || !passwordMatches) {
    await deps.auditLogRepository.record({
      accountId: credentials?.id ?? null,
      eventType: 'LOGIN_FAILED',
      ipAddress: input.ipAddress,
    });
    throw new InvalidCredentialsError();
  }

  if (credentials.status === 'PENDING_VERIFICATION') {
    throw new AccountNotVerifiedError();
  }
  if (credentials.status === 'SUSPENDED') {
    throw new AccountSuspendedError();
  }

  const accessToken = await signAccessToken(
    { accountId: credentials.id, isAdmin: credentials.isAdmin },
    deps.jwtSecret,
    ACCESS_TOKEN_TTL_SECONDS,
  );
  const refreshToken = generateOpaqueToken();
  await deps.refreshTokenRepository.create({
    accountId: credentials.id,
    tokenHash: refreshToken.hash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });
  await deps.auditLogRepository.record({
    accountId: credentials.id,
    eventType: 'LOGIN_SUCCESS',
    ipAddress: input.ipAddress,
  });

  return {
    account: {
      id: credentials.id,
      email: credentials.email,
      accountType: credentials.accountType,
      status: credentials.status,
      isAdmin: credentials.isAdmin,
    },
    accessToken,
    refreshToken: refreshToken.raw,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}
