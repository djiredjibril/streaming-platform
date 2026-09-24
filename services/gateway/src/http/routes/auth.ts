import * as grpc from '@grpc/grpc-js';
import type { FastifyInstance } from 'fastify';
import type { Logger } from '@streaming/shared-logging';
import { AccountType, type AuthResponse, type IdentityServiceClient } from '../../grpc/generated/identity.js';
import { registerBodySchema } from '../schemas.js';

export interface AuthRouteDeps {
  identityClient: IdentityServiceClient;
  logger: Logger;
}

const accountTypeToProto: Record<'PERSO' | 'FAMILLE' | 'ETUDIANT', AccountType> = {
  PERSO: AccountType.PERSO,
  FAMILLE: AccountType.FAMILLE,
  ETUDIANT: AccountType.ETUDIANT,
};

function callRegister(
  client: IdentityServiceClient,
  request: Parameters<IdentityServiceClient['register']>[0],
): Promise<AuthResponse> {
  return new Promise((resolve, reject) => {
    client.register(request, (error, response) => {
      if (error) reject(error);
      else resolve(response!);
    });
  });
}

/** Registers POST /auth/register. See docs/01-identity.md, "Endpoints exposés au frontend", for the REST contract. */
export function registerAuthRoutes(fastify: FastifyInstance, deps: AuthRouteDeps): void {
  fastify.post('/auth/register', async (request, reply) => {
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
    }
    const body = parsed.data;

    try {
      const response = await callRegister(deps.identityClient, {
        email: body.email,
        password: body.password,
        accountType: accountTypeToProto[body.accountType],
        universityEmail: body.universityEmail,
      });

      return reply.code(200).send({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        expiresIn: response.expiresIn,
        account: response.account,
      });
    } catch (error) {
      const serviceError = error as grpc.ServiceError;
      if (serviceError.code === grpc.status.INVALID_ARGUMENT) {
        return reply.code(400).send({ error: serviceError.details || serviceError.message });
      }
      if (serviceError.code === grpc.status.ALREADY_EXISTS) {
        return reply.code(409).send({ error: serviceError.details || serviceError.message });
      }
      deps.logger.error({ event: 'register_proxy_failed', error: String(error) });
      return reply.code(500).send({ error: 'Internal error' });
    }
  });
}
