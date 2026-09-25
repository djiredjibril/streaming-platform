import type { ContentRatingInput, TitleTypeInput } from './schemas.js';

export type MediaAssetStatusInput = 'PENDING_UPLOAD' | 'PROCESSING' | 'READY' | 'FAILED';

export interface TitleRecord {
  id: string;
  slug: string;
  type: TitleTypeInput;
  originalTitle: string;
  synopsis: string;
  releaseYear: number;
  rating: ContentRatingInput;
  runtimeMinutes: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  /** Null until AttachMediaAsset has been called at least once for this Title. */
  mediaAssetStatus: MediaAssetStatusInput | null;
  mediaAssetUrl: string | null;
  /** Genre names (docs/03-catalog.md's Genre/TitleGenre many-to-many) — always present, empty array if none tagged. */
  genres: string[];
}

export interface CreateTitleRecordInput {
  slug: string;
  type: TitleTypeInput;
  originalTitle: string;
  synopsis: string;
  releaseYear: number;
  rating: ContentRatingInput;
  runtimeMinutes?: number;
  posterUrl?: string;
  backdropUrl?: string;
  /** Genre names, upserted by name — see prismaTitleRepository.ts. */
  genres: string[];
}

/**
 * Port implemented by the Prisma-backed adapter in /infra. Kept here (in
 * /domain) so domain functions have zero dependency on Prisma and can be
 * unit-tested with an in-memory fake (services/AGENT.md §3).
 */
export interface TitleRepository {
  findBySlug(slug: string): Promise<TitleRecord | null>;
  findById(id: string): Promise<TitleRecord | null>;
  create(input: CreateTitleRecordInput): Promise<TitleRecord>;
  updateStatus(id: string, status: TitleRecord['status']): Promise<TitleRecord>;
}
