import * as grpc from '@grpc/grpc-js';
import type { ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import type { AccountRepository } from '../domain/accountRepository.js';
import { EmailAlreadyRegisteredError, InvalidRegisterInputError } from '../domain/errors.js';
import { registerAccount } from '../domain/registerAccount.js';
import { AccountType, type AuthResponse, type RegisterRequest } from './generated/identity.js';
import type { Logger } from '../infra/logger.js';

export interface IdentityServiceDeps {
  accountRepository: AccountRepository;
  logger: Logger;
}

const accountTypeToDomain: Record<AccountType, 'PERSO' | 'FAMILLE' | 'ETUDIANT' | null> = {
  [AccountType.PERSO]: 'PERSO',
  [AccountType.FAMILLE]: 'FAMILLE',
  [AccountType.ETUDIANT]: 'ETUDIANT',
  [AccountType.ACCOUNT_TYPE_UNSPECIFIED]: null,
  [AccountType.UNRECOGNIZED]: null,
};

const accountTypeToProto: Record<'PERSO' | 'FAMILLE' | 'ETUDIANT', AccountType> = {
  PERSO: AccountType.PERSO,
  FAMILLE: AccountType.FAMILLE,
  ETUDIANT: AccountType.ETUDIANT,
};

/**
 * Builds the IdentityService gRPC handler map (currently just `register`).
 * Pure adapter: translates proto messages to/from the domain layer and maps
 * domain errors to gRPC status codes — no business logic lives here.
 */
export function createIdentityServiceImpl(deps: IdentityServiceDeps) {
  return {
    async register(
      call: ServerUnaryCall<RegisterRequest, AuthResponse>,
      callback: sendUnaryData<AuthResponse>,
    ): Promise<void> {
      try {
        const account = await registerAccount(
          {
            email: call.request.email,
            password: call.request.password,
            accountType: accountTypeToDomain[call.request.accountType],
            universityEmail: call.request.universityEmail,
          },
          { accountRepository: deps.accountRepository },
        );

        deps.logger.info({ event: 'account_created', accountId: account.id });

        // No active session on registration — see proto comment on Register.
        callback(null, {
          accessToken: '',
          refreshToken: '',
          expiresIn: 0,
          account: {
            id: account.id,
            email: account.email,
            accountType: accountTypeToProto[account.accountType],
            status: account.status,
          },
        });
      } catch (error) {
        callback(toGrpcError(error), null);
      }
    },
  };
}

/** Maps a domain error to a gRPC ServiceError; unrecognized errors become INTERNAL (never leak internals to the caller). */
function toGrpcError(error: unknown): grpc.ServiceError {
  if (error instanceof InvalidRegisterInputError) {
    return buildServiceError(grpc.status.INVALID_ARGUMENT, error.message);
  }
  if (error instanceof EmailAlreadyRegisteredError) {
    return buildServiceError(grpc.status.ALREADY_EXISTS, error.message);
  }
  return buildServiceError(grpc.status.INTERNAL, 'Internal error');
}

function buildServiceError(code: grpc.status, message: string): grpc.ServiceError {
  return Object.assign(new Error(message), {
    code,
    details: message,
    metadata: new grpc.Metadata(),
  });
}
