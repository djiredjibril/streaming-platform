import argon2 from 'argon2';
import type { AccountRecord, AccountRepository } from './accountRepository.js';
import type { AuditLogRepository } from './auditLogRepository.js';
import type { RefreshTokenRepository } from './refreshTokenRepository.js';
import { AccountNotVerifiedError, AccountSuspendedError, InvalidCredentialsError } from './errors.js';
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

/**
 * Authenticates by email/password and, on success, issues a JWT access
 * token plus an opaque refresh token (stored hashed). Rejects
 * PENDING_VERIFICATION/SUSPENDED accounts. Every attempt is audited
 * (LOGIN_SUCCESS/LOGIN_FAILED) — this is why `ipAddress` is required input
 * rather than optional telemetry.
 */
export async function loginAccount(input: LoginInput, deps: LoginDeps): Promise<LoginResult> {
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

  const accessToken = await signAccessToken({ accountId: credentials.id }, deps.jwtSecret, ACCESS_TOKEN_TTL_SECONDS);
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
    },
    accessToken,
    refreshToken: refreshToken.raw,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}
