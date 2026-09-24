export type AuditEventType = 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'PASSWORD_RESET' | 'TOKEN_REVOKED';

export interface AuditEvent {
  /** Null when the attempt never resolved to a known account (e.g. login with an unknown email) — cf. docs/01-identity.md's AuditLog model. */
  accountId: string | null;
  eventType: AuditEventType;
  ipAddress: string;
}

/**
 * Port for the AuditLog trail — distinct from application logging
 * (services/AGENT.md §6): immutable, kept longer, queried for "what
 * happened on this account on date X", not for short-term debugging.
 */
export interface AuditLogRepository {
  record(event: AuditEvent): Promise<void>;
}
