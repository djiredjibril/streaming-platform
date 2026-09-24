import { randomUUID } from 'node:crypto';
import type { ServerUnaryCall } from '@grpc/grpc-js';

/**
 * Correlation ID for tracing one user request across services in the logs
 * (services/AGENT.md §5). Prefers the `x-correlation-id` metadata key (set
 * by the Gateway from its own request id — see
 * services/gateway/src/http/server.ts's `genReqId`) and falls back to a
 * fresh UUID for callers that don't set it (direct gRPC clients, tests) —
 * every request still gets a traceable id, just not one that ties back to
 * an upstream Gateway request.
 */
export function getCorrelationId(call: ServerUnaryCall<unknown, unknown>): string {
  const metadataId = call.metadata.get('x-correlation-id')[0];
  if (typeof metadataId === 'string' && metadataId.length > 0) {
    return metadataId;
  }
  return randomUUID();
}
