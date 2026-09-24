import type {
  CreateRefreshTokenInput,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../../../src/domain/refreshTokenRepository.js';

/** In-memory fake for unit-testing /domain functions without a real database. */
export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  private tokensById = new Map<string, RefreshTokenRecord>();

  async create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    const record: RefreshTokenRecord = {
      id: `rt_${this.tokensById.size + 1}`,
      accountId: input.accountId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.tokensById.set(record.id, record);
    return { ...record };
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    for (const token of this.tokensById.values()) {
      if (token.tokenHash === tokenHash) return { ...token };
    }
    return null;
  }

  async revoke(id: string): Promise<void> {
    const token = this.tokensById.get(id);
    if (token) token.revokedAt = new Date();
  }

  async revokeAllForAccount(accountId: string): Promise<void> {
    for (const token of this.tokensById.values()) {
      if (token.accountId === accountId && !token.revokedAt) token.revokedAt = new Date();
    }
  }

  get all(): RefreshTokenRecord[] {
    return [...this.tokensById.values()];
  }
}
