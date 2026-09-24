import * as grpc from '@grpc/grpc-js';
import type { PrismaClient } from '@prisma/client';
import { PrismaAccountRepository } from '../infra/prismaAccountRepository.js';
import { logger, type Logger } from '../infra/logger.js';
import { createIdentityServiceImpl } from './identityServiceImpl.js';
import { IdentityServiceService } from './generated/identity.js';

/**
 * Wires the gRPC server: registers IdentityServiceService against a
 * Prisma-backed AccountRepository. Takes `prisma`/`log` as parameters
 * (rather than importing the singletons directly) so tests can pass a
 * Testcontainers-backed PrismaClient instead.
 */
export function buildIdentityServer(prisma: PrismaClient, log: Logger = logger): grpc.Server {
  const server = new grpc.Server();
  const impl = createIdentityServiceImpl({
    accountRepository: new PrismaAccountRepository(prisma),
    logger: log,
  });
  server.addService(IdentityServiceService, impl);
  return server;
}

/** Binds and starts `server` on `address` (insecure locally — TLS termination happens at the Gateway/ingress). Resolves with the bound port. */
export function startIdentityServer(server: grpc.Server, address: string): Promise<number> {
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
