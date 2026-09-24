import * as grpc from '@grpc/grpc-js';
import type { PrismaClient } from '@prisma/client';
import { PrismaAccountRepository } from '../infra/prismaAccountRepository.js';
import { logger, type Logger } from '../infra/logger.js';
import { createIdentityServiceImpl } from './identityServiceImpl.js';
import { IdentityServiceService } from './generated/identity.js';

export function buildIdentityServer(prisma: PrismaClient, log: Logger = logger): grpc.Server {
  const server = new grpc.Server();
  const impl = createIdentityServiceImpl({
    accountRepository: new PrismaAccountRepository(prisma),
    logger: log,
  });
  server.addService(IdentityServiceService, impl);
  return server;
}

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
