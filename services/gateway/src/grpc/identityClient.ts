import * as grpc from '@grpc/grpc-js';
import { IdentityServiceClient } from './generated/identity.js';

/**
 * Builds a client to the Identity gRPC service. `address` is injected
 * (rather than read from env here) so tests can point it at an in-process
 * test server instead of the real one.
 */
export function createIdentityClient(address: string): IdentityServiceClient {
  return new IdentityServiceClient(address, grpc.credentials.createInsecure());
}
