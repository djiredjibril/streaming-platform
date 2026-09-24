import * as grpc from '@grpc/grpc-js';
import type { ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import type { AccountRecord, AccountRepository } from '../domain/accountRepository.js';
import type { AuditLogRepository } from '../domain/auditLogRepository.js';
import type { ProfileRecord, ProfileRepository } from '../domain/profileRepository.js';
import type { RateLimiter } from '../domain/rateLimiter.js';
import type { RefreshTokenRepository } from '../domain/refreshTokenRepository.js';
import {
  AccountNotFoundError,
  AccountNotVerifiedError,
  AccountSuspendedError,
  EmailAlreadyRegisteredError,
  InvalidAccessTokenError,
  InvalidCredentialsError,
  InvalidOrExpiredTokenError,
  InvalidProfileInputError,
  InvalidRefreshTokenError,
  InvalidRegisterInputError,
  ProfileLimitExceededError,
  RateLimitExceededError,
  RefreshTokenReuseDetectedError,
} from '../domain/errors.js';
import { createProfile } from '../domain/createProfile.js';
import { getAccount } from '../domain/getAccount.js';
import { listProfiles } from '../domain/listProfiles.js';
import { loginAccount } from '../domain/loginAccount.js';
import { logoutAccount } from '../domain/logoutAccount.js';
import { refreshSession } from '../domain/refreshSession.js';
import { registerAccount } from '../domain/registerAccount.js';
import { validateAccessToken } from '../domain/validateAccessToken.js';
import { verifyEmail } from '../domain/verifyEmail.js';
import {
  AccountType,
  type Account as ProtoAccount,
  type AuthResponse,
  type CreateProfileRequest,
  type GetAccountRequest,
  type ListProfilesRequest,
  type ListProfilesResponse,
  type LoginRequest,
  type LogoutRequest,
  type LogoutResponse,
  type Profile as ProtoProfile,
  type RefreshTokenRequest,
  type RegisterRequest,
  type ValidateTokenRequest,
  type ValidateTokenResponse,
  type VerifyEmailRequest,
} from './generated/identity.js';
import { getClientIp } from './clientIp.js';
import type { Logger } from '../infra/logger.js';

export interface IdentityServiceDeps {
  accountRepository: AccountRepository;
  profileRepository: ProfileRepository;
  refreshTokenRepository: RefreshTokenRepository;
  auditLogRepository: AuditLogRepository;
  rateLimiter: RateLimiter;
  jwtSecret: string;
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

function profileToProto(profile: ProfileRecord): ProtoProfile {
  return {
    id: profile.id,
    accountId: profile.accountId,
    displayName: profile.displayName,
    isKidsProfile: profile.isKidsProfile,
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
          getClientIp(call),
          { accountRepository: deps.accountRepository, rateLimiter: deps.rateLimiter },
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

    async login(
      call: ServerUnaryCall<LoginRequest, AuthResponse>,
      callback: sendUnaryData<AuthResponse>,
    ): Promise<void> {
      try {
        const result = await loginAccount(
          { email: call.request.email, password: call.request.password, ipAddress: getClientIp(call) },
          {
            accountRepository: deps.accountRepository,
            refreshTokenRepository: deps.refreshTokenRepository,
            auditLogRepository: deps.auditLogRepository,
            rateLimiter: deps.rateLimiter,
            jwtSecret: deps.jwtSecret,
          },
        );

        deps.logger.info({ event: 'login_success', accountId: result.account.id });
        callback(null, {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
          account: accountToProto(result.account),
        });
      } catch (error) {
        callback(toGrpcError(error), null);
      }
    },

    async refreshToken(
      call: ServerUnaryCall<RefreshTokenRequest, AuthResponse>,
      callback: sendUnaryData<AuthResponse>,
    ): Promise<void> {
      try {
        const result = await refreshSession(call.request.refreshToken, {
          accountRepository: deps.accountRepository,
          refreshTokenRepository: deps.refreshTokenRepository,
          auditLogRepository: deps.auditLogRepository,
          jwtSecret: deps.jwtSecret,
          ipAddress: getClientIp(call),
        });

        deps.logger.info({ event: 'token_refreshed', accountId: result.account.id });
        callback(null, {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
          account: accountToProto(result.account),
        });
      } catch (error) {
        if (error instanceof RefreshTokenReuseDetectedError) {
          deps.logger.warn({ event: 'refresh_token_reuse_detected' });
        }
        callback(toGrpcError(error), null);
      }
    },

    async logout(
      call: ServerUnaryCall<LogoutRequest, LogoutResponse>,
      callback: sendUnaryData<LogoutResponse>,
    ): Promise<void> {
      try {
        await logoutAccount(call.request.refreshToken, {
          refreshTokenRepository: deps.refreshTokenRepository,
        });
        callback(null, { success: true });
      } catch (error) {
        callback(toGrpcError(error), null);
      }
    },

    async validateToken(
      call: ServerUnaryCall<ValidateTokenRequest, ValidateTokenResponse>,
      callback: sendUnaryData<ValidateTokenResponse>,
    ): Promise<void> {
      try {
        const { accountId } = await validateAccessToken(call.request.accessToken, deps.jwtSecret);
        callback(null, { valid: true, accountId });
      } catch (error) {
        if (error instanceof InvalidAccessTokenError) {
          callback(null, { valid: false, accountId: '' });
          return;
        }
        callback(toGrpcError(error), null);
      }
    },

    async getAccount(
      call: ServerUnaryCall<GetAccountRequest, ProtoAccount>,
      callback: sendUnaryData<ProtoAccount>,
    ): Promise<void> {
      try {
        const account = await getAccount(call.request.accountId, deps.accountRepository);
        callback(null, accountToProto(account));
      } catch (error) {
        callback(toGrpcError(error), null);
      }
    },

    async createProfile(
      call: ServerUnaryCall<CreateProfileRequest, ProtoProfile>,
      callback: sendUnaryData<ProtoProfile>,
    ): Promise<void> {
      try {
        const profile = await createProfile(
          {
            accountId: call.request.accountId,
            displayName: call.request.displayName,
            isKidsProfile: call.request.isKidsProfile,
          },
          { accountRepository: deps.accountRepository, profileRepository: deps.profileRepository },
        );
        deps.logger.info({ event: 'profile_created', accountId: profile.accountId, profileId: profile.id });
        callback(null, profileToProto(profile));
      } catch (error) {
        callback(toGrpcError(error), null);
      }
    },

    async listProfiles(
      call: ServerUnaryCall<ListProfilesRequest, ListProfilesResponse>,
      callback: sendUnaryData<ListProfilesResponse>,
    ): Promise<void> {
      try {
        const profiles = await listProfiles(call.request.accountId, {
          accountRepository: deps.accountRepository,
          profileRepository: deps.profileRepository,
        });
        callback(null, { profiles: profiles.map(profileToProto) });
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
  if (error instanceof InvalidCredentialsError) {
    return buildServiceError(grpc.status.UNAUTHENTICATED, error.message);
  }
  if (error instanceof AccountNotVerifiedError) {
    return buildServiceError(grpc.status.FAILED_PRECONDITION, error.message);
  }
  if (error instanceof AccountSuspendedError) {
    return buildServiceError(grpc.status.PERMISSION_DENIED, error.message);
  }
  if (error instanceof InvalidRefreshTokenError || error instanceof RefreshTokenReuseDetectedError) {
    return buildServiceError(grpc.status.UNAUTHENTICATED, error.message);
  }
  if (error instanceof AccountNotFoundError) {
    return buildServiceError(grpc.status.NOT_FOUND, error.message);
  }
  if (error instanceof InvalidAccessTokenError) {
    return buildServiceError(grpc.status.UNAUTHENTICATED, error.message);
  }
  if (error instanceof ProfileLimitExceededError) {
    return buildServiceError(grpc.status.FAILED_PRECONDITION, error.message);
  }
  if (error instanceof InvalidProfileInputError) {
    return buildServiceError(grpc.status.INVALID_ARGUMENT, error.message);
  }
  if (error instanceof RateLimitExceededError) {
    return buildServiceError(grpc.status.RESOURCE_EXHAUSTED, error.message);
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
