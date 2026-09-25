import type { PrismaClient } from '../../generated/prisma-client/index.js';
import type { MediaAssetRecord, MediaAssetRepository } from '../domain/mediaAssetRepository.js';

/** Prisma-backed MediaAssetRepository — the only file in this service that issues SQL (via Prisma) for media assets. */
export class PrismaMediaAssetRepository implements MediaAssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertForTitle(titleId: string, url: string): Promise<MediaAssetRecord> {
    const mediaAsset = await this.prisma.mediaAsset.upsert({
      where: { titleId },
      create: { titleId, url },
      // Resets status to READY on replacement too — V1 has no re-processing step (see schema.prisma comment).
      update: { url, status: 'READY' },
    });
    return {
      id: mediaAsset.id,
      titleId: mediaAsset.titleId,
      status: mediaAsset.status as MediaAssetRecord['status'],
      url: mediaAsset.url,
    };
  }
}
