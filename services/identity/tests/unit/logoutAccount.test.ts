import { beforeEach, describe, expect, it } from 'vitest';
import { logoutAccount } from '../../src/domain/logoutAccount.js';
import { generateOpaqueToken } from '../../src/domain/tokens.js';
import { InMemoryRefreshTokenRepository } from './fakes/inMemoryRefreshTokenRepository.js';

describe('logoutAccount', () => {
  let refreshTokenRepository: InMemoryRefreshTokenRepository;

  beforeEach(() => {
    refreshTokenRepository = new InMemoryRefreshTokenRepository();
  });

  it('revokes the presented token', async () => {
    const token = generateOpaqueToken();
    await refreshTokenRepository.create({
      accountId: 'acc_1',
      tokenHash: token.hash,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await logoutAccount(token.raw, { refreshTokenRepository });

    const stored = await refreshTokenRepository.findByTokenHash(token.hash);
    expect(stored?.revokedAt).toBeTruthy();
  });

  it('is idempotent for an unknown token (no error)', async () => {
    await expect(logoutAccount('unknown-token', { refreshTokenRepository })).resolves.toBeUndefined();
  });

  it('is idempotent for an already-revoked token (no error)', async () => {
    const token = generateOpaqueToken();
    const created = await refreshTokenRepository.create({
      accountId: 'acc_1',
      tokenHash: token.hash,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await refreshTokenRepository.revoke(created.id);

    await expect(logoutAccount(token.raw, { refreshTokenRepository })).resolves.toBeUndefined();
  });
});
