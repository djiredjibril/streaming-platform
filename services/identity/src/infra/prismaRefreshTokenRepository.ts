import type { PrismaClient } from '@prisma/client';
import type {
  CreateRefreshTokenInput,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../domain/refreshTokenRepository.js';

/** Prisma-backed RefreshTokenRepository. */
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    return this.prisma.refreshToken.create({ data: input });
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findFirst({ where: { tokenHash } });
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  async revokeAllForAccount(accountId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
