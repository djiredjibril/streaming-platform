import type { AccountRecord, AccountRepository } from './accountRepository.js';
import type { AuditLogRepository } from './auditLogRepository.js';
import type { RefreshTokenRepository } from './refreshTokenRepository.js';
import {
  AccountNotFoundError,
  InvalidRefreshTokenError,
  RefreshTokenReuseDetectedError,
} from './errors.js';
import { generateOpaqueToken, hashOpaqueToken, signAccessToken } from './tokens.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './loginAccount.js';

export interface RefreshSessionDeps {
  accountRepository: AccountRepository;
  refreshTokenRepository: RefreshTokenRepository;
  auditLogRepository: AuditLogRepository;
  jwtSecret: string;
  ipAddress: string;
}

export interface RefreshSessionResult {
  account: AccountRecord;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Rotates a refresh token: the presented one is revoked and a fresh
 * access/refresh pair is issued. Presenting an already-revoked token is
 * treated as token theft (docs/01-identity.md, "refresh token rotation") —
 * every refresh token for the account is revoked and an audit TOKEN_REVOKED
 * event is written before throwing, so a stolen-and-reused token can't be
 * used again even by the legitimate holder without re-authenticating.
 */
export async function refreshSession(
  rawRefreshToken: string,
  deps: RefreshSessionDeps,
): Promise<RefreshSessionResult> {
  const tokenHash = hashOpaqueToken(rawRefreshToken);
  const existing = await deps.refreshTokenRepository.findByTokenHash(tokenHash);

  if (!existing) {
    throw new InvalidRefreshTokenError();
  }

  if (existing.revokedAt) {
    await deps.refreshTokenRepository.revokeAllForAccount(existing.accountId);
    await deps.auditLogRepository.record({
      accountId: existing.accountId,
      eventType: 'TOKEN_REVOKED',
      ipAddress: deps.ipAddress,
    });
    throw new RefreshTokenReuseDetectedError();
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    throw new InvalidRefreshTokenError();
  }

  const account = await deps.accountRepository.findById(existing.accountId);
  if (!account) {
    throw new AccountNotFoundError();
  }

  await deps.refreshTokenRepository.revoke(existing.id);

  const accessToken = await signAccessToken(
    { accountId: account.id, isAdmin: account.isAdmin },
    deps.jwtSecret,
    ACCESS_TOKEN_TTL_SECONDS,
  );
  const newRefreshToken = generateOpaqueToken();
  await deps.refreshTokenRepository.create({
    accountId: account.id,
    tokenHash: newRefreshToken.hash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  return {
    account,
    accessToken,
    refreshToken: newRefreshToken.raw,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}
