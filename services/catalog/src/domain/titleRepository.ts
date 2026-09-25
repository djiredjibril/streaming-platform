import type { ContentRatingInput, TitleTypeInput } from './schemas.js';

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
}

/**
 * Port implemented by the Prisma-backed adapter in /infra. Kept here (in
 * /domain) so domain functions have zero dependency on Prisma and can be
 * unit-tested with an in-memory fake (services/AGENT.md §3).
 */
export interface TitleRepository {
  findBySlug(slug: string): Promise<TitleRecord | null>;
  create(input: CreateTitleRecordInput): Promise<TitleRecord>;
}
