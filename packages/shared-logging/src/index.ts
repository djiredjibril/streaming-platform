import pino, { type Logger } from 'pino';

export type { Logger };

/**
 * Structured JSON logger shared across services. `service_name` is fixed
 * per instance so every log line is attributable without callers repeating
 * it; `correlation_id` is expected to be added per-request via child().
 * See services/AGENT.md, "Logging — standard à travers tous les services".
 */
export function createLogger(serviceName: string): Logger {
  return pino({
    base: { service_name: serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['password', 'passwordHash', 'password_hash', 'token', 'accessToken', 'refreshToken'],
      censor: '***',
    },
  });
}
