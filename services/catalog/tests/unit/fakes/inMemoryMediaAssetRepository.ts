import type { MediaAssetRecord, MediaAssetRepository } from '../../../src/domain/mediaAssetRepository.js';

/** In-memory fake for unit-testing /domain functions without a real database. */
export class InMemoryMediaAssetRepository implements MediaAssetRepository {
  private assetsByTitleId = new Map<string, MediaAssetRecord>();

  async upsertForTitle(titleId: string, url: string): Promise<MediaAssetRecord> {
    const existing = this.assetsByTitleId.get(titleId);
    const record: MediaAssetRecord = {
      id: existing?.id ?? `media_${this.assetsByTitleId.size + 1}`,
      titleId,
      status: 'READY',
      url,
    };
    this.assetsByTitleId.set(titleId, record);
    return record;
  }
}
