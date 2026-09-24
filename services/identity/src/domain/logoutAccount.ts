import type { RefreshTokenRepository } from './refreshTokenRepository.js';
import { hashOpaqueToken } from './tokens.js';

export interface LogoutDeps {
  refreshTokenRepository: RefreshTokenRepository;
}

/** Revokes the presented refresh token. Idempotent: an unknown or already-revoked token is not an error — the caller's goal (no longer logged in) is already true. */
export async function logoutAccount(rawRefreshToken: string, deps: LogoutDeps): Promise<void> {
  const existing = await deps.refreshTokenRepository.findByTokenHash(hashOpaqueToken(rawRefreshToken));
  if (existing && !existing.revokedAt) {
    await deps.refreshTokenRepository.revoke(existing.id);
  }
}
