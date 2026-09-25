import type { PrismaClient } from '../../generated/prisma-client/index.js';
import type { ProfileCreateInput, ProfileRecord, ProfileRepository } from '../domain/profileRepository.js';

/**
 * Prisma-backed ProfileRepository. `Role` is a near-static lookup table
 * (OWNER/MEMBER/KID) — rather than a separate seed step (extra
 * orchestration for every environment, including Testcontainers-backed
 * tests), `create` upserts the row on demand by its unique `name`.
 */
export class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: ProfileCreateInput): Promise<ProfileRecord> {
    const profile = await this.prisma.profile.create({
      data: {
        accountId: input.accountId,
        displayName: input.displayName,
        isKidsProfile: input.isKidsProfile,
        profileRoles: {
          create: {
            role: {
              connectOrCreate: {
                where: { name: input.role },
                create: { name: input.role },
              },
            },
          },
        },
      },
    });
    return toProfileRecord(profile);
  }

  async countByAccount(accountId: string): Promise<number> {
    return this.prisma.profile.count({ where: { accountId } });
  }

  async listByAccount(accountId: string): Promise<ProfileRecord[]> {
    const profiles = await this.prisma.profile.findMany({ where: { accountId } });
    return profiles.map(toProfileRecord);
  }
}

function toProfileRecord(profile: {
  id: string;
  accountId: string;
  displayName: string;
  isKidsProfile: boolean;
}): ProfileRecord {
  return {
    id: profile.id,
    accountId: profile.accountId,
    displayName: profile.displayName,
    isKidsProfile: profile.isKidsProfile,
  };
}
