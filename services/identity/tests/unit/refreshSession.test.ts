import { beforeEach, describe, expect, it } from 'vitest';
import { InvalidRefreshTokenError, RefreshTokenReuseDetectedError } from '../../src/domain/errors.js';
import { loginAccount } from '../../src/domain/loginAccount.js';
import { refreshSession } from '../../src/domain/refreshSession.js';
import { registerAccount } from '../../src/domain/registerAccount.js';
import { InMemoryAccountRepository } from './fakes/inMemoryAccountRepository.js';
import { InMemoryAuditLogRepository } from './fakes/inMemoryAuditLogRepository.js';
import { InMemoryRefreshTokenRepository } from './fakes/inMemoryRefreshTokenRepository.js';

const JWT_SECRET = 'unit-test-secret';
const EMAIL = 'jane@example.com';
const PASSWORD = 'correct-horse-battery';

describe('refreshSession', () => {
  let accountRepository: InMemoryAccountRepository;
  let refreshTokenRepository: InMemoryRefreshTokenRepository;
  let auditLogRepository: InMemoryAuditLogRepository;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
    refreshTokenRepository = new InMemoryRefreshTokenRepository();
    auditLogRepository = new InMemoryAuditLogRepository();
  });

  const deps = () => ({
    accountRepository,
    refreshTokenRepository,
    auditLogRepository,
    jwtSecret: JWT_SECRET,
    ipAddress: '127.0.0.1',
  });

  async function loginActiveAccount() {
    const { account } = await registerAccount({ email: EMAIL, password: PASSWORD, accountType: 'PERSO' }, {
      accountRepository,
    });
    accountRepository.forceStatus(account.id, 'ACTIVE');
    return loginAccount(
      { email: EMAIL, password: PASSWORD, ipAddress: '127.0.0.1' },
      { accountRepository, refreshTokenRepository, auditLogRepository, jwtSecret: JWT_SECRET },
    );
  }

  it('rotates: old token revoked, new token issued', async () => {
    const { refreshToken } = await loginActiveAccount();

    const result = await refreshSession(refreshToken, deps());

    expect(result.refreshToken).not.toBe(refreshToken);
    expect(refreshTokenRepository.all).toHaveLength(2);
    expect(refreshTokenRepository.all.filter((t) => t.revokedAt)).toHaveLength(1);
  });

  it('rejects an unknown token', async () => {
    await expect(refreshSession('not-a-real-token', deps())).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('detects reuse of an already-rotated token and revokes every token for the account', async () => {
    const { refreshToken } = await loginActiveAccount();
    await refreshSession(refreshToken, deps()); // rotates once, `refreshToken` is now revoked

    await expect(refreshSession(refreshToken, deps())).rejects.toBeInstanceOf(RefreshTokenReuseDetectedError);

    expect(refreshTokenRepository.all.every((t) => t.revokedAt)).toBe(true);
    expect(auditLogRepository.events).toContainEqual(expect.objectContaining({ eventType: 'TOKEN_REVOKED' }));
  });
});
