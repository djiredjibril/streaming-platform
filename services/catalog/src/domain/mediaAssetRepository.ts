import type { MediaAssetStatusInput } from './titleRepository.js';

export interface MediaAssetRecord {
  id: string;
  titleId: string;
  status: MediaAssetStatusInput;
  url: string;
}

/**
 * Port implemented by the Prisma-backed adapter in /infra. One MediaAsset
 * per Title in V1 (no Episode yet) — see prisma/schema.prisma's MediaAsset
 * comment for why `status` defaults to READY instead of going through a
 * real upload/processing lifecycle.
 */
export interface MediaAssetRepository {
  /** Creates the MediaAsset if none exists for this title, else replaces its url (and resets status to READY). */
  upsertForTitle(titleId: string, url: string): Promise<MediaAssetRecord>;
}
