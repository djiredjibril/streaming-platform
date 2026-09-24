import * as grpc from '@grpc/grpc-js';
import type { ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import type { AccountRecord, AccountRepository } from '../domain/accountRepository.js';
import {
  EmailAlreadyRegisteredError,
  InvalidOrExpiredTokenError,
  InvalidRegisterInputError,
} from '../domain/errors.js';
import { registerAccount } from '../domain/registerAccount.js';
import { verifyEmail } from '../domain/verifyEmail.js';
import {
  AccountType,
  type Account as ProtoAccount,
  type AuthResponse,
  type RegisterRequest,
  type VerifyEmailRequest,
} from './generated/identity.js';
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

function accountToProto(account: AccountRecord): ProtoAccount {
  return {
    id: account.id,
    email: account.email,
    accountType: accountTypeToProto[account.accountType],
    status: account.status,
  };
}

/** No active session — see the Register/VerifyEmail comments in /proto/identity.proto. */
function noSessionResponse(account: AccountRecord, emailVerificationToken?: string): AuthResponse {
  return {
    accessToken: '',
    refreshToken: '',
    expiresIn: 0,
    account: accountToProto(account),
    emailVerificationToken,
  };
}

/**
 * Builds the IdentityService gRPC handler map. Pure adapter: translates
 * proto messages to/from the domain layer and maps domain errors to gRPC
 * status codes — no business logic lives here.
 */
export function createIdentityServiceImpl(deps: IdentityServiceDeps) {
  return {
    async register(
      call: ServerUnaryCall<RegisterRequest, AuthResponse>,
      callback: sendUnaryData<AuthResponse>,
    ): Promise<void> {
      try {
        const { account, emailVerificationToken } = await registerAccount(
          {
            email: call.request.email,
            password: call.request.password,
            accountType: accountTypeToDomain[call.request.accountType],
            universityEmail: call.request.universityEmail,
          },
          { accountRepository: deps.accountRepository },
        );

        deps.logger.info({ event: 'account_created', accountId: account.id });
        callback(null, noSessionResponse(account, emailVerificationToken));
      } catch (error) {
        callback(toGrpcError(error), null);
      }
    },

    async verifyEmail(
      call: ServerUnaryCall<VerifyEmailRequest, AuthResponse>,
      callback: sendUnaryData<AuthResponse>,
    ): Promise<void> {
      try {
        const account = await verifyEmail(call.request.token, {
          accountRepository: deps.accountRepository,
        });
        deps.logger.info({ event: 'account_verified', accountId: account.id });
        callback(null, noSessionResponse(account));
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
  if (error instanceof InvalidOrExpiredTokenError) {
    return buildServiceError(grpc.status.INVALID_ARGUMENT, error.message);
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
