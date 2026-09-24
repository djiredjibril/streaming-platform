export interface CreateRefreshTokenInput {
  accountId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RefreshTokenRecord {
  id: string;
  accountId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Port implemented by the Prisma-backed adapter in /infra. */
export interface RefreshTokenRepository {
  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord>;
  findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revoke(id: string): Promise<void>;
  /** Used on reuse-detected token theft (see domain/refreshSession.ts): revokes every refresh token for the account. */
  revokeAllForAccount(accountId: string): Promise<void>;
}
