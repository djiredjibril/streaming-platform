import * as grpc from '@grpc/grpc-js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from '@streaming/shared-logging';
import { callUnary } from '../../grpc/callUnary.js';
import {
  AccountType,
  type Account,
  type AuthResponse,
  type CreateProfileRequest,
  type GetAccountRequest,
  type IdentityServiceClient,
  type ListProfilesRequest,
  type ListProfilesResponse,
  type LoginRequest,
  type LogoutRequest,
  type LogoutResponse,
  type Profile,
  type RefreshTokenRequest,
  type RegisterRequest,
  type ValidateTokenRequest,
  type ValidateTokenResponse,
  type VerifyEmailRequest,
} from '../../grpc/generated/identity.js';
import { createProfileBodySchema, loginBodySchema, registerBodySchema, verifyEmailBodySchema } from '../schemas.js';

export interface AuthRouteDeps {
  identityClient: IdentityServiceClient;
  logger: Logger;
}

const accountTypeToProto: Record<'PERSO' | 'FAMILLE' | 'ETUDIANT', AccountType> = {
  PERSO: AccountType.PERSO,
  FAMILLE: AccountType.FAMILLE,
  ETUDIANT: AccountType.ETUDIANT,
};

const REFRESH_TOKEN_COOKIE = 'refresh_token';
// Matches domain/refreshSession.ts's REFRESH_TOKEN_TTL_SECONDS (identity service) — kept as a literal
// here since the Gateway has no dependency on Identity's domain layer at runtime.
const REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Metadata attached to every gRPC call to Identity. Always carries
 * `x-correlation-id` (= `request.id`, itself the incoming `x-correlation-id`
 * HTTP header or a fresh UUID — see `genReqId` in http/server.ts) so every
 * Identity log line triggered by this request can be tied back to it
 * (services/AGENT.md §5). `x-client-ip` is only set when requested — it
 * feeds Identity's AuditLog and rate limiter (see grpc/clientIp.ts on the
 * Identity side), which only login/register/refresh care about.
 */
function requestMetadata(request: FastifyRequest, opts?: { includeClientIp?: boolean }): grpc.Metadata {
  const metadata = new grpc.Metadata();
  metadata.set('x-correlation-id', request.id);
  if (opts?.includeClientIp) {
    metadata.set('x-client-ip', request.ip);
  }
  return metadata;
}

function setRefreshTokenCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/auth',
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS,
  });
}

/** Maps a gRPC error to an HTTP status + body. 500s are logged with full detail server-side and return a generic message (services/AGENT.md §8: never expose internals to the client). */
function mapGrpcError(error: unknown, logger: Logger, event: string): { status: number; body: { error: string } } {
  const serviceError = error as grpc.ServiceError;
  switch (serviceError.code) {
    case grpc.status.INVALID_ARGUMENT:
      return { status: 400, body: { error: serviceError.details || serviceError.message } };
    case grpc.status.ALREADY_EXISTS:
      return { status: 409, body: { error: serviceError.details || serviceError.message } };
    case grpc.status.UNAUTHENTICATED:
      return { status: 401, body: { error: serviceError.details || serviceError.message } };
    case grpc.status.FAILED_PRECONDITION:
    case grpc.status.PERMISSION_DENIED:
      return { status: 403, body: { error: serviceError.details || serviceError.message } };
    case grpc.status.NOT_FOUND:
      return { status: 404, body: { error: serviceError.details || serviceError.message } };
    case grpc.status.RESOURCE_EXHAUSTED:
      return { status: 429, body: { error: serviceError.details || serviceError.message } };
    default:
      logger.error({ event, error: String(error) });
      return { status: 500, body: { error: 'Internal error' } };
  }
}

/**
 * Extracts the `Authorization: Bearer <token>` header, validates it via
 * IdentityService.ValidateToken, and returns the accountId it resolves to.
 * Every route that acts on "the caller's own account" (currently /auth/me
 * and /auth/profiles) MUST derive accountId this way rather than accepting
 * one from the request — otherwise any authenticated caller could read or
 * write another account's data by just passing its id (IDOR).
 *
 * Returns null (after sending the error response itself) when
 * unauthenticated/invalid, so callers can `if (!accountId) return;`.
 */
async function requireAccountId(
  request: FastifyRequest,
  reply: FastifyReply,
  client: IdentityServiceClient,
): Promise<string | null> {
  const authHeader = request.headers.authorization;
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;
  if (!accessToken) {
    reply.code(401).send({ error: 'Missing bearer token' });
    return null;
  }

  const validation = await callUnary<ValidateTokenRequest, ValidateTokenResponse>(
    client.validateToken.bind(client),
    { accessToken },
    requestMetadata(request),
  );
  if (!validation.valid) {
    reply.code(401).send({ error: 'Invalid or expired access token' });
    return null;
  }
  return validation.accountId;
}

/** Registers the /auth/* REST routes. See docs/01-identity.md, "Endpoints exposés au frontend", for the REST contract. */
export function registerAuthRoutes(fastify: FastifyInstance, deps: AuthRouteDeps): void {
  const client = deps.identityClient;

  fastify.post('/auth/register', async (request, reply) => {
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
    }
    const body = parsed.data;

    try {
      const response = await callUnary<RegisterRequest, AuthResponse>(
        client.register.bind(client),
        {
          email: body.email,
          password: body.password,
          accountType: accountTypeToProto[body.accountType],
          universityEmail: body.universityEmail,
        },
        requestMetadata(request, { includeClientIp: true }),
      );

      // No cookie: Register never returns an active session (tokens are empty).
      return reply.code(200).send({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        expiresIn: response.expiresIn,
        account: response.account,
        emailVerificationToken: response.emailVerificationToken,
      });
    } catch (error) {
      const { status, body: errorBody } = mapGrpcError(error, deps.logger, 'register_proxy_failed');
      return reply.code(status).send(errorBody);
    }
  });

  fastify.post('/auth/verify-email', async (request, reply) => {
    const parsed = verifyEmailBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
    }

    try {
      const response = await callUnary<VerifyEmailRequest, AuthResponse>(
        client.verifyEmail.bind(client),
        { token: parsed.data.token },
        requestMetadata(request),
      );
      return reply.code(200).send({ account: response.account });
    } catch (error) {
      const { status, body } = mapGrpcError(error, deps.logger, 'verify_email_proxy_failed');
      return reply.code(status).send(body);
    }
  });

  fastify.post('/auth/login', async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
    }

    try {
      const response = await callUnary<LoginRequest, AuthResponse>(
        client.login.bind(client),
        parsed.data,
        requestMetadata(request, { includeClientIp: true }),
      );
      setRefreshTokenCookie(reply, response.refreshToken);
      // refreshToken deliberately not in the JSON body — it lives only in the httpOnly cookie (apps/web/AGENT.md).
      return reply.code(200).send({
        accessToken: response.accessToken,
        expiresIn: response.expiresIn,
        account: response.account,
      });
    } catch (error) {
      const { status, body } = mapGrpcError(error, deps.logger, 'login_proxy_failed');
      return reply.code(status).send(body);
    }
  });

  fastify.post('/auth/refresh', async (request, reply) => {
    const token = request.cookies[REFRESH_TOKEN_COOKIE];
    if (!token) {
      return reply.code(401).send({ error: 'Missing refresh token' });
    }

    try {
      const response = await callUnary<RefreshTokenRequest, AuthResponse>(
        client.refreshToken.bind(client),
        { refreshToken: token },
        requestMetadata(request, { includeClientIp: true }),
      );
      setRefreshTokenCookie(reply, response.refreshToken);
      return reply.code(200).send({
        accessToken: response.accessToken,
        expiresIn: response.expiresIn,
        account: response.account,
      });
    } catch (error) {
      reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/auth' });
      const { status, body } = mapGrpcError(error, deps.logger, 'refresh_proxy_failed');
      return reply.code(status).send(body);
    }
  });

  fastify.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[REFRESH_TOKEN_COOKIE];
    reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/auth' });

    if (!token) {
      return reply.code(204).send();
    }

    try {
      await callUnary<LogoutRequest, LogoutResponse>(
        client.logout.bind(client),
        { refreshToken: token },
        requestMetadata(request),
      );
      return reply.code(204).send();
    } catch (error) {
      const { status, body } = mapGrpcError(error, deps.logger, 'logout_proxy_failed');
      return reply.code(status).send(body);
    }
  });

  fastify.get('/auth/me', async (request, reply) => {
    const accountId = await requireAccountId(request, reply, client);
    if (!accountId) return;

    try {
      const account = await callUnary<GetAccountRequest, Account>(
        client.getAccount.bind(client),
        { accountId },
        requestMetadata(request),
      );
      return reply.code(200).send(account);
    } catch (error) {
      const { status, body } = mapGrpcError(error, deps.logger, 'me_proxy_failed');
      return reply.code(status).send(body);
    }
  });

  fastify.post('/auth/profiles', async (request, reply) => {
    const accountId = await requireAccountId(request, reply, client);
    if (!accountId) return;

    const parsed = createProfileBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
    }

    try {
      const profile = await callUnary<CreateProfileRequest, Profile>(
        client.createProfile.bind(client),
        {
          accountId,
          displayName: parsed.data.displayName,
          isKidsProfile: parsed.data.isKidsProfile,
        },
        requestMetadata(request),
      );
      return reply.code(200).send(profile);
    } catch (error) {
      const { status, body } = mapGrpcError(error, deps.logger, 'create_profile_proxy_failed');
      return reply.code(status).send(body);
    }
  });

  fastify.get('/auth/profiles', async (request, reply) => {
    const accountId = await requireAccountId(request, reply, client);
    if (!accountId) return;

    try {
      const response = await callUnary<ListProfilesRequest, ListProfilesResponse>(
        client.listProfiles.bind(client),
        { accountId },
        requestMetadata(request),
      );
      return reply.code(200).send(response.profiles);
    } catch (error) {
      const { status, body } = mapGrpcError(error, deps.logger, 'list_profiles_proxy_failed');
      return reply.code(status).send(body);
    }
  });
}
