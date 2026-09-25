import * as grpc from '@grpc/grpc-js';
import type { PrismaClient } from '@prisma/client';
import { PrismaTitleRepository } from '../infra/prismaTitleRepository.js';
import { createCatalogServiceImpl } from './catalogServiceImpl.js';
import { CatalogServiceService } from './generated/catalog.js';

/**
 * Wires the gRPC server: registers CatalogServiceService against the
 * Prisma-backed TitleRepository. Takes `prisma` as a parameter (rather than
 * importing the singleton directly) so tests can pass a Testcontainers-
 * backed instance — same shape as Identity's grpc/server.ts.
 */
export function buildCatalogServer(prisma: PrismaClient): grpc.Server {
  const server = new grpc.Server();
  const impl = createCatalogServiceImpl({
    titleRepository: new PrismaTitleRepository(prisma),
  });
  server.addService(CatalogServiceService, impl);
  return server;
}

/** Binds and starts `server` on `address` (insecure locally — TLS termination happens at the Gateway/ingress). Resolves with the bound port. */
export function startCatalogServer(server: grpc.Server, address: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (error, port) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(port);
    });
  });
}
