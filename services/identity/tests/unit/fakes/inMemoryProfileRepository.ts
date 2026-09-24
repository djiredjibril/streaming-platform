import type { ProfileCreateInput, ProfileRecord, ProfileRepository } from '../../../src/domain/profileRepository.js';

/** In-memory fake for unit-testing /domain functions without a real database. */
export class InMemoryProfileRepository implements ProfileRepository {
  private profiles: (ProfileRecord & { role: ProfileCreateInput['role'] })[] = [];

  async create(input: ProfileCreateInput): Promise<ProfileRecord> {
    const record = {
      id: `prof_${this.profiles.length + 1}`,
      accountId: input.accountId,
      displayName: input.displayName,
      isKidsProfile: input.isKidsProfile,
      role: input.role,
    };
    this.profiles.push(record);
    return { id: record.id, accountId: record.accountId, displayName: record.displayName, isKidsProfile: record.isKidsProfile };
  }

  async countByAccount(accountId: string): Promise<number> {
    return this.profiles.filter((p) => p.accountId === accountId).length;
  }

  async listByAccount(accountId: string): Promise<ProfileRecord[]> {
    return this.profiles
      .filter((p) => p.accountId === accountId)
      .map(({ id, accountId, displayName, isKidsProfile }) => ({ id, accountId, displayName, isKidsProfile }));
  }

  /** Test-only helper to inspect the role assigned to the last created profile. */
  roleFor(profileId: string): ProfileCreateInput['role'] | undefined {
    return this.profiles.find((p) => p.id === profileId)?.role;
  }
}
