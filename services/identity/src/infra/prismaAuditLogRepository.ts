import type { PrismaClient } from '@prisma/client';
import type { AuditEvent, AuditLogRepository } from '../domain/auditLogRepository.js';

/** Prisma-backed AuditLogRepository. */
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(event: AuditEvent): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        accountId: event.accountId,
        eventType: event.eventType,
        ipAddress: event.ipAddress,
      },
    });
  }
}
