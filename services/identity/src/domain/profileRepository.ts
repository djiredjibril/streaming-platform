export type ProfileRole = 'OWNER' | 'MEMBER' | 'KID';

export interface ProfileRecord {
  id: string;
  accountId: string;
  displayName: string;
  isKidsProfile: boolean;
}

/** Repository-level input — includes the role already decided by createProfile.ts's business rule, unlike domain/schemas.ts's CreateProfileInput which is the raw validated request. */
export interface ProfileCreateInput {
  accountId: string;
  displayName: string;
  isKidsProfile: boolean;
  role: ProfileRole;
}

/** Port implemented by the Prisma-backed adapter in /infra. */
export interface ProfileRepository {
  create(input: ProfileCreateInput): Promise<ProfileRecord>;
  countByAccount(accountId: string): Promise<number>;
  listByAccount(accountId: string): Promise<ProfileRecord[]>;
}
