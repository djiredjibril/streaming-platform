import type { AuditEvent, AuditLogRepository } from '../../../src/domain/auditLogRepository.js';

/** In-memory fake for unit-testing /domain functions without a real database. */
export class InMemoryAuditLogRepository implements AuditLogRepository {
  public events: AuditEvent[] = [];

  async record(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }
}
