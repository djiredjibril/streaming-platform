import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export interface OpaqueToken {
  /** Sent to the caller once, never persisted. */
  raw: string;
  /** What actually gets stored — never store the raw token (cf. services/AGENT.md §7). */
  hash: string;
}

/**
 * Generates a high-entropy opaque token (refresh tokens, the mocked email
 * verification token) and its SHA-256 hash. SHA-256, not argon2id: these
 * are server-generated 256-bit random secrets, not user-chosen passwords —
 * argon2id's deliberate slowness defends against guessing a low-entropy
 * secret, which doesn't apply here and would just waste CPU on every
 * refresh/verify call.
 */
export function generateOpaqueToken(): OpaqueToken {
  const raw = randomBytes(32).toString('hex');
  return { raw, hash: hashOpaqueToken(raw) };
}

export function hashOpaqueToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface AccessTokenPayload {
  accountId: string;
}

/** Signs a short-lived JWT access token (HS256). `secret` is injected — never read from env inside /domain. */
export async function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  expiresInSeconds: number,
): Promise<string> {
  return new SignJWT({ sub: payload.accountId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(new TextEncoder().encode(secret));
}

/** Verifies an access token's signature and expiry. Throws if invalid/expired. */
export async function verifyAccessToken(token: string, secret: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
  if (typeof payload.sub !== 'string') {
    throw new Error('Malformed access token: missing sub claim');
  }
  return { accountId: payload.sub };
}
