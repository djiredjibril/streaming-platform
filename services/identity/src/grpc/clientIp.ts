import type { ServerUnaryCall } from '@grpc/grpc-js';

/**
 * Best-effort client IP for AuditLog. Prefers the `x-client-ip` metadata
 * key (set by the Gateway from the real HTTP request IP — see
 * services/gateway/src/http/routes/auth.ts) and falls back to
 * `call.getPeer()`, which for calls made directly by the Gateway is the
 * Gateway's own address, not the end user's. Known V1 limitation when
 * called without the metadata (e.g. direct gRPC test clients).
 */
export function getClientIp(call: ServerUnaryCall<unknown, unknown>): string {
  const metadataIp = call.metadata.get('x-client-ip')[0];
  if (typeof metadataIp === 'string' && metadataIp.length > 0) {
    return metadataIp;
  }
  return call.getPeer();
}
