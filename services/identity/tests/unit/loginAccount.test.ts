import { beforeEach, describe, expect, it } from 'vitest';
import {
  AccountNotVerifiedError,
  AccountSuspendedError,
  InvalidCredentialsError,
  RateLimitExceededError,
} from '../../src/domain/errors.js';
import { loginAccount } from '../../src/domain/loginAccount.js';
import { registerAccount } from '../../src/domain/registerAccount.js';
import { verifyAccessToken } from '../../src/domain/tokens.js';
import { InMemoryAccountRepository } from './fakes/inMemoryAccountRepository.js';
import { InMemoryAuditLogRepository } from './fakes/inMemoryAuditLogRepository.js';
import { InMemoryRateLimiter } from './fakes/inMemoryRateLimiter.js';
import { InMemoryRefreshTokenRepository } from './fakes/inMemoryRefreshTokenRepository.js';

const JWT_SECRET = 'unit-test-secret';
const EMAIL = 'jane@example.com';
const PASSWORD = 'correct-horse-battery';
const IP = '127.0.0.1';

describe('loginAccount', () => {
  let accountRepository: InMemoryAccountRepository;
  let refreshTokenRepository: InMemoryRefreshTokenRepository;
  let auditLogRepository: InMemoryAuditLogRepository;
  let rateLimiter: InMemoryRateLimiter;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
    refreshTokenRepository = new InMemoryRefreshTokenRepository();
    auditLogRepository = new InMemoryAuditLogRepository();
    rateLimiter = new InMemoryRateLimiter();
  });

  async function registerAndActivate() {
    const { account, emailVerificationToken } = await registerAccount(
      { email: EMAIL, password: PASSWORD, accountType: 'PERSO' },
      IP,
      { accountRepository, rateLimiter },
    );
    accountRepository.forceStatus(account.id, 'ACTIVE');
    void emailVerificationToken;
    return account;
  }

  const deps = () => ({
    accountRepository,
    refreshTokenRepository,
    auditLogRepository,
    rateLimiter,
    jwtSecret: JWT_SECRET,
  });

  it('issues an access token + refresh token for correct credentials on an ACTIVE account', async () => {
    const account = await registerAndActivate();

    const result = await loginAccount({ email: EMAIL, password: PASSWORD, ipAddress: IP }, deps());

    expect(result.account.id).toBe(account.id);
    expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
    const payload = await verifyAccessToken(result.accessToken, JWT_SECRET);
    expect(payload.accountId).toBe(account.id);

    expect(refreshTokenRepository.all).toHaveLength(1);
    expect(auditLogRepository.events).toContainEqual(
      expect.objectContaining({ eventType: 'LOGIN_SUCCESS', accountId: account.id }),
    );
  });

  it('embeds isAdmin in the JWT claim (no self-service grant path — see accountRepository.forceAdmin)', async () => {
    const account = await registerAndActivate();
    accountRepository.forceAdmin(account.id, true);

    const result = await loginAccount({ email: EMAIL, password: PASSWORD, ipAddress: IP }, deps());

    expect(result.account.isAdmin).toBe(true);
    const payload = await verifyAccessToken(result.accessToken, JWT_SECRET);
    expect(payload.isAdmin).toBe(true);
  });

  it('rejects a wrong password and audits LOGIN_FAILED', async () => {
    const account = await registerAndActivate();

    await expect(
      loginAccount({ email: EMAIL, password: 'wrong-password', ipAddress: IP }, deps()),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(auditLogRepository.events).toContainEqual(
      expect.objectContaining({ eventType: 'LOGIN_FAILED', accountId: account.id }),
    );
  });

  it('rejects an unknown email without revealing that (generic error) and audits with accountId null', async () => {
    await expect(
      loginAccount({ email: 'nobody@example.com', password: PASSWORD, ipAddress: IP }, deps()),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(auditLogRepository.events).toContainEqual(
      expect.objectContaining({ eventType: 'LOGIN_FAILED', accountId: null }),
    );
  });

  it('rejects a PENDING_VERIFICATION account', async () => {
    await registerAccount({ email: EMAIL, password: PASSWORD, accountType: 'PERSO' }, IP, {
      accountRepository,
      rateLimiter,
    });

    await expect(
      loginAccount({ email: EMAIL, password: PASSWORD, ipAddress: IP }, deps()),
    ).rejects.toBeInstanceOf(AccountNotVerifiedError);
  });

  it('rejects a SUSPENDED account', async () => {
    const account = await registerAndActivate();
    accountRepository.forceStatus(account.id, 'SUSPENDED');

    await expect(
      loginAccount({ email: EMAIL, password: PASSWORD, ipAddress: IP }, deps()),
    ).rejects.toBeInstanceOf(AccountSuspendedError);
  });

  it('rate-limits by IP: the 6th attempt within the window is rejected without even checking the password', async () => {
    await registerAndActivate();

    for (let i = 0; i < 5; i++) {
      await expect(
        loginAccount({ email: EMAIL, password: 'wrong-password', ipAddress: IP }, deps()),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    await expect(
      loginAccount({ email: EMAIL, password: PASSWORD, ipAddress: IP }, deps()),
    ).rejects.toBeInstanceOf(RateLimitExceededError);
  });
});
