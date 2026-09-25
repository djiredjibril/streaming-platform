import * as grpc from '@grpc/grpc-js';
import { CatalogServiceClient } from './generated/catalog.js';

/**
 * Builds a client to the Catalog gRPC service. `address` is injected
 * (rather than read from env here) so tests can point it at an in-process
 * test server instead of the real one — same shape as identityClient.ts.
 */
export function createCatalogClient(address: string): CatalogServiceClient {
  return new CatalogServiceClient(address, grpc.credentials.createInsecure());
}
