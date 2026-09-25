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
  /** Needed to build a BrowseTitles pagination cursor (domain/cursor.ts) — not exposed over gRPC/GraphQL itself. */
  createdAt: Date;
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

export interface BrowseTitlesFilter {
  genre?: string;
  type?: TitleTypeInput;
  cursor?: { createdAt: Date; id: string };
  /** Rows requested, NOT capped here — the repository returns exactly this many (or fewer). domain/browseTitles.ts asks for limit+1 to detect a next page. */
  limit: number;
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
  /** PUBLISHED titles only, newest first (createdAt desc, id desc as tiebreaker) — see BrowseTitles's comment in /proto/catalog.proto. */
  browse(filter: BrowseTitlesFilter): Promise<TitleRecord[]>;
}
