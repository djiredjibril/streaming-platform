import { describe, expect, it } from 'vitest';
import { InvalidAccessTokenError } from '../../src/domain/errors.js';
import { signAccessToken } from '../../src/domain/tokens.js';
import { validateAccessToken } from '../../src/domain/validateAccessToken.js';

const SECRET = 'unit-test-secret';

describe('validateAccessToken', () => {
  it('returns the accountId for a valid token', async () => {
    const token = await signAccessToken({ accountId: 'acc_1' }, SECRET, 60);

    const result = await validateAccessToken(token, SECRET);

    expect(result.accountId).toBe('acc_1');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signAccessToken({ accountId: 'acc_1' }, 'other-secret', 60);

    await expect(validateAccessToken(token, SECRET)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  it('rejects an expired token', async () => {
    const token = await signAccessToken({ accountId: 'acc_1' }, SECRET, -1);

    await expect(validateAccessToken(token, SECRET)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  it('rejects garbage input', async () => {
    await expect(validateAccessToken('not-a-jwt', SECRET)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });
});
