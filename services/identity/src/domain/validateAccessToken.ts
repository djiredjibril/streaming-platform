import { InvalidAccessTokenError } from './errors.js';
import { verifyAccessToken } from './tokens.js';

export interface ValidateAccessTokenResult {
  accountId: string;
  isAdmin: boolean;
}

/**
 * Verifies a JWT access token's signature and expiry. This will be the
 * most frequently called RPC in the whole system once other services
 * (Billing, Delivery, Social) call it before every protected action — see
 * docs/01-identity.md.
 */
export async function validateAccessToken(
  rawToken: string,
  jwtSecret: string,
): Promise<ValidateAccessTokenResult> {
  try {
    return await verifyAccessToken(rawToken, jwtSecret);
  } catch {
    throw new InvalidAccessTokenError();
  }
}
